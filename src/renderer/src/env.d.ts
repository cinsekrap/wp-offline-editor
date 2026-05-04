/// <reference types="vite/client" />

import type { ElectronAPI } from '@shared/types'
import type { JSX as ReactJSX } from 'react'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
  // React 19 removed the global JSX namespace; re-export it so existing
  // `JSX.Element` annotations across the codebase keep resolving.
  namespace JSX {
    type Element = ReactJSX.Element
    type ElementClass = ReactJSX.ElementClass
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute
    type LibraryManagedAttributes<C, P> = ReactJSX.LibraryManagedAttributes<C, P>
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes
    type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>
    type IntrinsicElements = ReactJSX.IntrinsicElements
  }
}
