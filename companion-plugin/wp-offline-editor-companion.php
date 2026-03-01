<?php
/**
 * Plugin Name: NP Presspad Companion
 * Description: Exposes ACF field groups and fields via REST API for NP Presspad schema discovery, including code-registered field groups.
 * Version: 0.9.2
 * Author: Nic Chambers-Parkes
 * Author URI: https://www.nicparkes.com
 * License: GPL-2.0-only
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WPOE_VERSION', '0.9.2' );

require_once plugin_dir_path( __FILE__ ) . 'plugin-update-checker/plugin-update-checker.php';
$wpoeUpdateChecker = YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
	'https://github.com/cinsekrap/wp-offline-editor/',
	__FILE__,
	'wp-offline-editor-companion'
);
$wpoeUpdateChecker->getVcsApi()->enableReleaseAssets( '/wp-offline-editor-companion\.zip/' );

add_action( 'init', function () {
	register_post_type( 'scratchpad', [
		'label'           => 'Scratchpads',
		'public'          => false,
		'show_ui'         => false,
		'show_in_rest'    => true,
		'rest_base'       => 'scratchpads',
		'supports'        => [ 'title', 'editor', 'custom-fields' ],
		'capability_type' => 'post',
		'map_meta_cap'    => true,
	] );

	register_post_meta( 'post', '_scratchpad_id', [
		'type'          => 'integer',
		'single'        => true,
		'show_in_rest'  => true,
		'auth_callback' => function () { return current_user_can( 'edit_posts' ); },
	] );
} );

add_action( 'rest_api_init', function () {

	// GET wpoe/v1/status — unauthenticated, used for namespace detection.
	register_rest_route( 'wpoe/v1', '/status', [
		'methods'             => 'GET',
		'callback'            => function () {
			return [
				'active'  => true,
				'version' => WPOE_VERSION,
				'acf'     => function_exists( 'acf_get_field_groups' ),
			];
		},
		'permission_callback' => '__return_true',
	] );

	// GET wpoe/v1/field-groups — returns all active ACF field groups.
	register_rest_route( 'wpoe/v1', '/field-groups', [
		'methods'             => 'GET',
		'callback'            => function () {
			if ( ! function_exists( 'acf_get_field_groups' ) ) {
				return new WP_Error( 'acf_missing', 'ACF is not active.', [ 'status' => 404 ] );
			}

			$groups = acf_get_field_groups();
			$result = [];

			foreach ( $groups as $group ) {
				if ( empty( $group['active'] ) ) {
					continue;
				}

				$result[] = [
					'id'       => $group['ID'] ?: 0,
					'key'      => $group['key'],
					'title'    => $group['title'],
					'active'   => true,
					'modified' => $group['modified'] ?? 0,
					'location' => $group['location'] ?? [],
				];
			}

			return $result;
		},
		'permission_callback' => function () {
			return current_user_can( 'edit_posts' );
		},
	] );

	// GET wpoe/v1/field-groups/(?P<key>[\w]+)/fields — returns fields for a group.
	register_rest_route( 'wpoe/v1', '/field-groups/(?P<key>[\\w]+)/fields', [
		'methods'             => 'GET',
		'callback'            => function ( WP_REST_Request $request ) {
			if ( ! function_exists( 'acf_get_fields' ) ) {
				return new WP_Error( 'acf_missing', 'ACF is not active.', [ 'status' => 404 ] );
			}

			$group_key = $request->get_param( 'key' );

			// acf_get_fields accepts a group key or ID.
			$fields = acf_get_fields( $group_key );

			if ( $fields === false || $fields === null ) {
				return new WP_Error( 'not_found', 'Field group not found.', [ 'status' => 404 ] );
			}

			return wpoe_normalize_fields( $fields );
		},
		'permission_callback' => function () {
			return current_user_can( 'edit_posts' );
		},
	] );
} );

/**
 * Internal-only keys to strip from ACF field arrays.
 */
function wpoe_internal_keys(): array {
	return [
		'ID', 'id', 'parent', 'parent_layout', 'menu_order',
		'value', 'prefix', '_name', '_valid', '_prepare',
		'wpml_cf_preferences',
	];
}

/**
 * Recursively normalize ACF field arrays for JSON output.
 * Uses a blacklist approach — passes through all properties except internal runtime keys.
 */
function wpoe_normalize_fields( array $fields ): array {
	$result      = [];
	$strip_keys  = array_flip( wpoe_internal_keys() );

	foreach ( $fields as $field ) {
		// Start from the full field array, then strip internal keys.
		$normalized = array_diff_key( $field, $strip_keys );

		// Ensure required is boolean.
		$normalized['required'] = ! empty( $field['required'] );

		// Repeater / group sub_fields — recurse.
		if ( ! empty( $field['sub_fields'] ) ) {
			$normalized['sub_fields'] = wpoe_normalize_fields( $field['sub_fields'] );
		}

		// Flexible content layouts — recurse each layout's sub_fields.
		if ( $field['type'] === 'flexible_content' && ! empty( $field['layouts'] ) ) {
			$layouts = is_array( $field['layouts'] ) ? array_values( $field['layouts'] ) : [];
			$normalized['layouts'] = [];

			foreach ( $layouts as $layout ) {
				$layout_entry = array_diff_key( $layout, $strip_keys );

				if ( ! empty( $layout['sub_fields'] ) ) {
					$layout_entry['sub_fields'] = wpoe_normalize_fields( $layout['sub_fields'] );
				}

				$normalized['layouts'][] = $layout_entry;
			}
		}

		$result[] = $normalized;
	}

	return $result;
}
