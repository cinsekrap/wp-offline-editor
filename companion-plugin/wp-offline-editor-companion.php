<?php
/**
 * Plugin Name: NP Presspad Companion
 * Description: Exposes ACF field groups, fields, and values via REST API for NP Presspad, including code-registered field groups that ACF's own REST integration withholds.
 * Version: 1.2.0
 * Author: Nic Chambers-Parkes
 * Author URI: https://www.nicparkes.com
 * License: GPL-2.0-only
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WPOE_VERSION', '1.2.0' );

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

	// GET wpoe/v1/status — `active` is unauthenticated so the app can detect the
	// namespace, but the version and capability detail are not. An anonymous
	// version number is a free fingerprint for anyone scanning for a plugin
	// release with a known weakness, and this plugin now writes field values.
	register_rest_route( 'wpoe/v1', '/status', [
		'methods'             => 'GET',
		'callback'            => function () {
			$status = [ 'active' => true ];

			if ( current_user_can( 'edit_posts' ) ) {
				$status['version'] = WPOE_VERSION;
				$status['acf']     = function_exists( 'acf_get_field_groups' );
			}

			return $status;
		},
		'permission_callback' => '__return_true',
	] );

	// GET wpoe/v1/shortcodes — the tags registered on this site, so the editor can
	// offer them. Authenticated: the list enumerates the site's plugins and theme
	// features, which is exactly the inventory an attacker wants. Tag names only —
	// never the callbacks, which would leak class and function names.
	register_rest_route( 'wpoe/v1', '/shortcodes', [
		'methods'             => 'GET',
		'callback'            => function () {
			$tags = array_keys( $GLOBALS['shortcode_tags'] ?? [] );
			sort( $tags );

			return array_map( function ( $tag ) {
				return [ 'tag' => $tag ];
			}, $tags );
		},
		'permission_callback' => function () {
			return current_user_can( 'edit_posts' );
		},
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
 * ACF field values, for field groups ACF's own REST integration won't expose.
 *
 * ACF gates its `acf` REST field on each field group's "Show in REST API"
 * setting, in both directions. A group registered in code without that setting —
 * the common case for theme and plugin authors — is therefore invisible to the
 * REST API: the app can render the fields (their schema comes from
 * /field-groups, which is not gated) but never receives a value, and cannot
 * write one back, because WordPress silently drops a body key no registered
 * field claims.
 *
 * Telling every site owner to enable "Show in REST API" would fix it by making
 * the values PUBLIC — ACF's reader has no capability check, and context=view is
 * unauthenticated. This field is the narrower option: same values, but only for
 * a user who could already read and edit them in wp-admin.
 *
 * Registered under a distinct key so it can never collide with ACF's own `acf`
 * field on a site where some groups do opt in.
 *
 * Site owners who would rather not expose values this way can opt out:
 *
 *     add_filter( 'wpoe_expose_acf_values', '__return_false' );
 */
add_action( 'rest_api_init', function () {
	if ( ! function_exists( 'acf_get_field_groups' ) ) {
		return;
	}

	/**
	 * Filter whether the companion plugin exposes ACF values to the app.
	 *
	 * @param bool $expose Default true.
	 */
	if ( ! apply_filters( 'wpoe_expose_acf_values', true ) ) {
		return;
	}

	register_rest_field( get_post_types( [ 'show_in_rest' => true ], 'names' ), 'wpoe_acf', [
		'get_callback'    => 'wpoe_acf_get_values',
		'update_callback' => 'wpoe_acf_update_values',
		'schema'          => null,
	] );
} );

/**
 * Read handler.
 *
 * The capability check here is load-bearing, not defence in depth. A
 * get_callback runs for ANY request that includes the field, and an
 * unauthenticated `GET /wp/v2/posts` with no _fields includes every field, so
 * nothing upstream of this line protects the values. Returns null rather than a
 * WP_Error when refusing, so a public response stays well-formed.
 *
 * Null also carries meaning for the client: "no answer available" as opposed to
 * an empty array, which means "asked and answered, this post has no values".
 */
function wpoe_acf_get_values( $object, $field_name, $request ) {
	$post_id = isset( $object['id'] ) ? (int) $object['id'] : 0;
	if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
		return null;
	}

	$values = [];

	foreach ( wpoe_acf_fields_for_post( $post_id ) as $field ) {
		$value = acf_get_value( $post_id, $field );

		// 'light' is pinned rather than read from the rest_api_format setting.
		// 'standard' applies each field's display formatting — a date_picker
		// comes back as "21/02/2019" instead of the stored "20190221" — which is
		// lossy for a client that has to write the value back.
		if ( function_exists( 'acf_format_value_for_rest' ) ) {
			$value = acf_format_value_for_rest( $value, $post_id, $field, 'light' );
		}

		$values[ $field['name'] ] = $value;
	}

	return $values;
}

/**
 * Write handler.
 *
 * Two controls, both copied from ACF's own update path:
 *
 * 1. Every incoming name is resolved against the fields of groups that apply to
 *    THIS post, and anything unresolvable is dropped. Without that, a user who
 *    can edit one post could write arbitrary post meta on it — protected
 *    underscore-prefixed keys, _wp_page_template, or another plugin's meta.
 *    ACF disabled its own update-by-key path for the same reason.
 * 2. Values are run through wp_kses_post_deep unless the user may post
 *    unfiltered HTML, so an author cannot store markup the theme will print.
 *    Deep, because repeater and flexible-content values nest.
 */
function wpoe_acf_update_values( $values, $object, $field_name, $request ) {
	if ( ! is_array( $values ) || ! $values ) {
		return true;
	}

	$post_id = function_exists( 'acf_get_object_id' ) ? (int) acf_get_object_id( $object ) : 0;
	if ( ! $post_id && isset( $object->ID ) ) {
		$post_id = (int) $object->ID;
	}

	if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
		return new WP_Error(
			'wpoe_acf_cannot_edit',
			'You are not allowed to edit custom fields on this post.',
			[ 'status' => 403 ]
		);
	}

	if ( function_exists( 'acf_allow_unfiltered_html' ) && ! acf_allow_unfiltered_html() ) {
		$values = wp_kses_post_deep( $values );
	}

	$allowed = wpoe_acf_fields_for_post( $post_id );
	if ( ! $allowed ) {
		return true;
	}

	foreach ( $values as $name => $value ) {
		$field = acf_search_fields( $name, $allowed );
		if ( ! $field ) {
			continue;
		}

		acf_update_value( $value, $post_id, $field );
	}

	return true;
}

/**
 * Fields of every active group whose location rules match this post.
 *
 * Deliberately not filtered on the group's show_in_rest — that is the whole
 * point of this field. Field TYPES that opt out of REST are still skipped, the
 * same test ACF applies: those are layout constructs (tabs, messages,
 * accordions) that carry no value.
 */
function wpoe_acf_fields_for_post( int $post_id ): array {
	// Same lookup ACF uses to resolve the groups applicable to a post.
	$groups = acf_get_field_groups( [ 'post_id' => $post_id ] );
	$fields = [];

	foreach ( $groups as $group ) {
		if ( empty( $group['active'] ) ) {
			continue;
		}

		foreach ( (array) acf_get_fields( $group ) as $field ) {
			if ( empty( $field['name'] ) || ! wpoe_acf_type_allows_rest( $field ) ) {
				continue;
			}

			$fields[] = $field;
		}
	}

	return $fields;
}

/** Whether this field's TYPE participates in REST at all. */
function wpoe_acf_type_allows_rest( array $field ): bool {
	if ( ! function_exists( 'acf_get_field_type' ) ) {
		return true;
	}

	$type = acf_get_field_type( $field['type'] ?? '' );

	return $type && isset( $type->show_in_rest ) && $type->show_in_rest;
}

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
 * Make the posts-list "Last Modified" column show the modified date.
 *
 * WP_Posts_List_Table::column_date() labels a row "Last Modified" for anything
 * not published or scheduled, but the time it prints is always get_the_time() —
 * the post DATE. For a draft that never moves, so an edited draft keeps showing
 * the date it was created however many times it is revised, whether the edit came
 * from this app or from WordPress itself.
 *
 * post_modified is already correct in the database; only the rendering is wrong.
 * So this corrects the display rather than writing a falsified post_date, which
 * would lose the real creation date and change what the post publishes with.
 *
 * Scoped to exactly the rows core mislabels: statuses other than publish/future,
 * which are the ones it calls "Last Modified". Published and scheduled rows are
 * left alone — there the date shown is genuinely the publish date.
 */
add_filter( 'post_date_column_time', function ( $t_time, $post, $column_name, $mode ) {
	unset( $mode );

	if ( 'date' !== $column_name || ! $post instanceof WP_Post ) {
		return $t_time;
	}

	if ( in_array( $post->post_status, [ 'publish', 'future' ], true ) ) {
		return $t_time;
	}

	// Core's own "no date yet" case — leave its "Unpublished" text intact.
	if ( '0000-00-00 00:00:00' === $post->post_date ) {
		return $t_time;
	}

	if ( empty( $post->post_modified ) || '0000-00-00 00:00:00' === $post->post_modified ) {
		return $t_time;
	}

	return sprintf(
		/* translators: 1: Post modified date, 2: Post modified time. */
		__( '%1$s at %2$s', 'wp-offline-editor-companion' ),
		get_post_modified_time( __( 'Y/m/d', 'wp-offline-editor-companion' ), false, $post, true ),
		get_post_modified_time( __( 'g:i a', 'wp-offline-editor-companion' ), false, $post, true )
	);
}, 10, 4 );

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
