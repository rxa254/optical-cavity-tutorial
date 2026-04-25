"use strict";
(self["webpackChunk_anywidget_monorepo"] = self["webpackChunk_anywidget_monorepo"] || []).push([["951"], {
106(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  "default": () => (/* binding */ src_plugin)
});

// EXTERNAL MODULE: consume shared module (default) @jupyter-widgets/base@^6 (strict)
var base_6_strict_ = __webpack_require__(319);
// EXTERNAL MODULE: ./node_modules/.pnpm/@lukeed+uuid@2.0.1/node_modules/@lukeed/uuid/dist/index.mjs
var dist = __webpack_require__(661);
// EXTERNAL MODULE: ./node_modules/.pnpm/solid-js@1.9.12/node_modules/solid-js/dist/solid.js
var solid = __webpack_require__(621);
;// CONCATENATED MODULE: ./packages/anywidget/src/widget.js



/** @import { DOMWidgetModel, DOMWidgetView } from "@jupyter-widgets/base" */
/** @import { Initialize, Render, AnyModel } from "@anywidget/types" */

/**
 * @template T
 * @typedef {T | PromiseLike<T>} Awaitable
 */

/**
 * @typedef AnyWidget
 * @prop initialize {Initialize}
 * @prop render {Render}
 */

/**
 *  @typedef AnyWidgetModule
 *  @prop render {Render=}
 *  @prop default {AnyWidget | (() => AnyWidget | Promise<AnyWidget>)=}
 */

/**
 * @param {unknown} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * @param {string} str
 * @returns {str is "https://${string}" | "http://${string}"}
 */
function is_href(str) {
  return str.startsWith("http://") || str.startsWith("https://");
}

/**
 * @param {string} href
 * @param {string} anywidget_id
 * @returns {Promise<void>}
 */
async function load_css_href(href, anywidget_id) {
  /** @type {HTMLLinkElement | null} */
  let prev = document.querySelector(`link[id='${anywidget_id}']`);

  // Adapted from https://github.com/vitejs/vite/blob/d59e1acc2efc0307488364e9f2fad528ec57f204/packages/vite/src/client/client.ts#L185-L201
  // Swaps out old styles with new, but avoids flash of unstyled content.
  // No need to await the load since we already have styles applied.
  if (prev) {
    /** @type {HTMLLinkElement} */
    // @ts-expect-error - we know it's an HTMLLinkElement because prev is an HTMLLinkElement
    let newLink = prev.cloneNode();
    newLink.href = href;
    newLink.addEventListener("load", () => prev?.remove());
    newLink.addEventListener("error", () => prev?.remove());
    prev.after(newLink);
    return;
  }

  return new Promise((resolve) => {
    let link = Object.assign(document.createElement("link"), {
      rel: "stylesheet",
      href,
      onload: resolve,
    });
    document.head.appendChild(link);
  });
}

/**
 * @param {string} css_text
 * @param {string} anywidget_id
 * @returns {void}
 */
function load_css_text(css_text, anywidget_id) {
  /** @type {HTMLStyleElement | null} */
  let prev = document.querySelector(`style[id='${anywidget_id}']`);
  if (prev) {
    // replace instead of creating a new DOM node
    prev.textContent = css_text;
    return;
  }
  let style = Object.assign(document.createElement("style"), {
    id: anywidget_id,
    type: "text/css",
  });
  style.appendChild(document.createTextNode(css_text));
  document.head.appendChild(style);
}

/**
 * @param {string | undefined} css
 * @param {string} anywidget_id
 * @returns {Promise<void>}
 */
async function load_css(css, anywidget_id) {
  if (!css || !anywidget_id) return;
  if (is_href(css)) return load_css_href(css, anywidget_id);
  return load_css_text(css, anywidget_id);
}

/**
 * @param {string} esm
 * @returns {Promise<AnyWidgetModule>}
 */
async function load_esm(esm) {
  if (is_href(esm)) {
    return await import(/* webpackIgnore: true */ /* @vite-ignore */ esm);
  }
  let url = URL.createObjectURL(new Blob([esm], { type: "text/javascript" }));
  let mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ url);
  URL.revokeObjectURL(url);
  return mod;
}

/** @param {string} anywidget_id */
function warn_render_deprecation(anywidget_id) {
  console.warn(`\
[anywidget] Deprecation Warning for ${anywidget_id}: Direct export of a 'render' will likely be deprecated in the future. To migrate ...

Remove the 'export' keyword from 'render'
-----------------------------------------

export function render({ model, el }) { ... }
^^^^^^

Create a default export that returns an object with 'render'
------------------------------------------------------------

function render({ model, el }) { ... }
         ^^^^^^
export default { render }
                 ^^^^^^

Pin to anywidget>=0.9.0 in your pyproject.toml
----------------------------------------------

dependencies = ["anywidget>=0.9.0"]

To learn more, please see: https://github.com/manzt/anywidget/pull/395.
`);
}

/**
 * @param {string} esm
 * @param {string} anywidget_id
 * @returns {Promise<AnyWidget>}
 */
async function load_widget(esm, anywidget_id) {
  let mod = await load_esm(esm);
  if (mod.render) {
    warn_render_deprecation(anywidget_id);
    return {
      async initialize() {},
      render: mod.render,
    };
  }
  assert(mod.default, `[anywidget] module must export a default function or object.`);
  let widget = typeof mod.default === "function" ? await mod.default() : mod.default;
  return widget;
}

/**
 * This is a trick so that we can cleanup event listeners added
 * by the user-defined function.
 */
let INITIALIZE_MARKER = Symbol("anywidget.initialize");

/**
 * @param {DOMWidgetModel} model
 * @param {unknown} context
 * @return {import("@anywidget/types").AnyModel}
 *
 * Prunes the view down to the minimum context necessary.
 *
 * Calls to `model.get` and `model.set` automatically add the
 * `context`, so we can gracefully unsubscribe from events
 * added by user-defined hooks.
 */
function model_proxy(model, context) {
  return {
    get: model.get.bind(model),
    set: model.set.bind(model),
    save_changes: model.save_changes.bind(model),
    send: model.send.bind(model),
    on(name, callback) {
      model.on(name, callback, context);
    },
    off(name, callback) {
      model.off(name, callback, context);
    },
    // @ts-expect-error - the widget_manager type is wider than what
    // we want to expose to developers.
    // In a future version, we will expose a more limited API but
    // that can wait for a minor version bump.
    widget_manager: model.widget_manager,
  };
}

/**
 * @param {void | (() => Awaitable<void>)} fn
 * @param {string} kind
 */
async function safe_cleanup(fn, kind) {
  return Promise.resolve()
    .then(() => fn?.())
    .catch((e) => console.warn(`[anywidget] error cleaning up ${kind}.`, e));
}

/**
 * @template T
 * @typedef Ready
 * @property {"ready"} status
 * @property {T} data
 */

/**
 * @typedef Pending
 * @property {"pending"} status
 */

/**
 * @typedef Errored
 * @property {"error"} status
 * @property {unknown} error
 */

/**
 * @template T
 * @typedef {Pending | Ready<T> | Errored} Result
 */

/**
 * Cleans up the stack trace at anywidget boundary.
 * You can fully inspect the entire stack trace in the console interactively,
 * but the initial error message is cleaned up to be more user-friendly.
 *
 * @param {unknown} source
 */
function throw_anywidget_error(source) {
  if (!(source instanceof Error)) {
    // Don't know what to do with this.
    throw source;
  }
  let lines = source.stack?.split("\n") ?? [];
  let anywidget_index = lines.findIndex((line) => line.includes("anywidget"));
  let clean_stack = anywidget_index === -1 ? lines : lines.slice(0, anywidget_index + 1);
  source.stack = clean_stack.join("\n");
  console.error(source);
  throw source;
}

/**
 * @typedef InvokeOptions
 * @prop {DataView[]} [buffers]
 * @prop {AbortSignal} [signal]
 */

/**
 * @template T
 * @param {import("@anywidget/types").AnyModel} model
 * @param {string} name
 * @param {any} [msg]
 * @param {InvokeOptions} [options]
 * @return {Promise<[T, DataView[]]>}
 */
function invoke(model, name, msg, options = {}) {
  // crypto.randomUUID() is not available in non-secure contexts (i.e., http://)
  // so we use simple (non-secure) polyfill.
  let id = dist.v4();
  let signal = options.signal ?? AbortSignal.timeout(3000);

  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
    }
    signal.addEventListener("abort", () => {
      model.off("msg:custom", handler);
      reject(signal.reason);
    });

    /**
     * @param {{ id: string, kind: "anywidget-command-response", response: T }} msg
     * @param {DataView[]} buffers
     */
    function handler(msg, buffers) {
      if (!(msg.id === id)) return;
      resolve([msg.response, buffers]);
      model.off("msg:custom", handler);
    }
    model.on("msg:custom", handler);
    model.send({ id, kind: "anywidget-command", name, msg }, undefined, options.buffers ?? []);
  });
}

/**
 * Polyfill for {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers Promise.withResolvers}
 *
 * Trevor(2025-03-14): Should be able to remove once more stable across browsers.
 *
 * @template T
 * @returns {PromiseWithResolvers<T>}
 */
function promise_with_resolvers() {
  let resolve;
  let reject;
  let promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // @ts-expect-error - We know these types are ok
  return { promise, resolve, reject };
}

/**
 * @template {Record<string, unknown>} T
 * @template {keyof T & string} K
 * @param {AnyModel<T>} model
 * @param {K} name
 * @param {{ signal?: AbortSignal}} options
 * @returns {solid.Accessor<T[K]>}
 */
function observe(model, name, { signal }) {
  let [get, set] = solid/* .createSignal */.n5(model.get(name));
  let update = () => set(() => model.get(name));
  model.on(`change:${name}`, update);
  signal?.addEventListener("abort", () => {
    model.off(`change:${name}`, update);
  });
  return get;
}

/**
 * @typedef State
 * @property {string} _esm
 * @property {string} _anywidget_id
 * @property {string | undefined} _css
 */

class Runtime {
  /** @type {solid.Accessor<Result<AnyWidget>>} */
  // @ts-expect-error - Set synchronously in constructor.
  #widget_result;
  /** @type {AbortSignal} */
  #signal;
  /** @type {Promise<void>} */
  ready;

  /**
   * @param {DOMWidgetModel} model
   * @param {{ signal: AbortSignal }} options
   */
  constructor(model, options) {
    /** @type {PromiseWithResolvers<void>} */
    let resolvers = promise_with_resolvers();
    this.ready = resolvers.promise;
    this.#signal = options.signal;
    this.#signal.throwIfAborted();
    this.#signal.addEventListener("abort", () => dispose());
    AbortSignal.timeout(2000).addEventListener("abort", () => {
      resolvers.reject(new Error("[anywidget] Failed to initialize model."));
    });
    let dispose = solid/* .createRoot */.Hr((dispose) => {
      /** @type {AnyModel<State>} */
      // @ts-expect-error - Types don't sufficiently overlap, so we cast here for type-safe access
      let typed_model = model;
      let id = typed_model.get("_anywidget_id");
      let css = observe(typed_model, "_css", { signal: this.#signal });
      let esm = observe(typed_model, "_esm", { signal: this.#signal });
      let [widget_result, set_widget_result] = solid/* .createSignal */.n5(
        /** @type {Result<AnyWidget>} */ ({ status: "pending" }),
      );
      this.#widget_result = widget_result;

      solid/* .createEffect */.EH(
        solid.on(css, () => console.debug(`[anywidget] css hot updated: ${id}`), { defer: true }),
      );
      solid/* .createEffect */.EH(
        solid.on(esm, () => console.debug(`[anywidget] esm hot updated: ${id}`), { defer: true }),
      );
      solid/* .createEffect */.EH(() => {
        return load_css(css(), id);
      });
      solid/* .createEffect */.EH(() => {
        let controller = new AbortController();
        solid/* .onCleanup */.Ki(() => controller.abort());
        model.off(null, null, INITIALIZE_MARKER);
        load_widget(esm(), id)
          .then(async (widget) => {
            if (controller.signal.aborted) {
              return;
            }
            let cleanup = await widget.initialize?.({
              model: model_proxy(model, INITIALIZE_MARKER),
              experimental: {
                // @ts-expect-error - bind isn't working
                invoke: invoke.bind(null, model),
              },
            });
            if (controller.signal.aborted) {
              return safe_cleanup(cleanup, "esm update");
            }
            controller.signal.addEventListener("abort", () => safe_cleanup(cleanup, "esm update"));
            set_widget_result({ status: "ready", data: widget });
            resolvers.resolve();
          })
          .catch((error) => set_widget_result({ status: "error", error }));
      });

      return dispose;
    });
  }

  /**
   * @param {DOMWidgetView} view
   * @param {{ signal: AbortSignal }} options
   * @returns {Promise<void>}
   */
  async create_view(view, options) {
    let model = view.model;
    let signal = AbortSignal.any([this.#signal, options.signal]); // either model or view destroyed
    signal.throwIfAborted();
    signal.addEventListener("abort", () => dispose());
    let dispose = solid/* .createRoot */.Hr((dispose) => {
      solid/* .createEffect */.EH(() => {
        // Clear all previous event listeners from this hook.
        model.off(null, null, view);
        view.$el.empty();
        let result = this.#widget_result();
        if (result.status === "pending") {
          return;
        }
        if (result.status === "error") {
          throw_anywidget_error(result.error);
          return;
        }
        let controller = new AbortController();
        solid/* .onCleanup */.Ki(() => controller.abort());
        Promise.resolve()
          .then(async () => {
            let cleanup = await result.data.render?.({
              model: model_proxy(model, view),
              el: view.el,
              experimental: {
                // @ts-expect-error - bind isn't working
                invoke: invoke.bind(null, model),
              },
            });
            if (controller.signal.aborted) {
              return safe_cleanup(cleanup, "dispose view - already aborted");
            }
            controller.signal.addEventListener("abort", () =>
              safe_cleanup(cleanup, "dispose view - aborted"),
            );
          })
          .catch((error) => throw_anywidget_error(error));
      });
      return () => dispose();
    });
  }
}

// @ts-expect-error - injected by bundler
let version = "0.10.0";

/**
 * @param {{
 *   DOMWidgetModel: typeof import("@jupyter-widgets/base").DOMWidgetModel,
 *   DOMWidgetView: typeof import("@jupyter-widgets/base").DOMWidgetView
 * }} options
 * @returns {{ AnyModel: typeof import("@jupyter-widgets/base").DOMWidgetModel, AnyView: typeof import("@jupyter-widgets/base").DOMWidgetView }}
 */
/* export default */ function src_widget({ DOMWidgetModel, DOMWidgetView }) {
  /** @type {WeakMap<AnyModel, Runtime>} */
  let RUNTIMES = new WeakMap();

  class AnyModel extends DOMWidgetModel {
    static model_name = "AnyModel";
    static model_module = "anywidget";
    static model_module_version = version;

    static view_name = "AnyView";
    static view_module = "anywidget";
    static view_module_version = version;

    /** @param {Parameters<InstanceType<typeof DOMWidgetModel>["initialize"]>} args */
    initialize(...args) {
      super.initialize(...args);
      let controller = new AbortController();
      this.once("destroy", () => {
        controller.abort("[anywidget] Runtime destroyed.");
        RUNTIMES.delete(this);
      });
      RUNTIMES.set(this, new Runtime(this, { signal: controller.signal }));
    }

    /** @param {Parameters<InstanceType<typeof DOMWidgetModel>["_handle_comm_msg"]>} msg */
    async _handle_comm_msg(...msg) {
      let runtime = RUNTIMES.get(this);
      await runtime?.ready;
      return super._handle_comm_msg(...msg);
    }

    /**
     * @param {Record<string, any>} state
     *
     * We override to support binary trailets because JSON.parse(JSON.stringify())
     * does not properly clone binary data (it just returns an empty object).
     *
     * https://github.com/jupyter-widgets/ipywidgets/blob/47058a373d2c2b3acf101677b2745e14b76dd74b/packages/base/src/widget.ts#L562-L583
     */
    serialize(state) {
      // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- accessing static `.serializers` on `this.constructor`
      let serializers = /** @type {typeof DOMWidgetModel} */ (this.constructor).serializers || {};
      for (let k of Object.keys(state)) {
        try {
          let serialize = serializers[k]?.serialize;
          if (serialize) {
            state[k] = serialize(state[k], this);
          } else if (k === "layout" || k === "style") {
            // These keys come from ipywidgets, rely on JSON.stringify trick.
            state[k] = JSON.parse(JSON.stringify(state[k]));
          } else {
            state[k] = structuredClone(state[k]);
          }
          if (typeof state[k]?.toJSON === "function") {
            state[k] = state[k].toJSON();
          }
        } catch (e) {
          console.error("Error serializing widget state attribute: ", k);
          throw e;
        }
      }
      return state;
    }
  }

  class AnyView extends DOMWidgetView {
    #controller = new AbortController();
    async render() {
      let runtime = RUNTIMES.get(this.model);
      assert(runtime, "[anywidget] Runtime not found.");
      await runtime.create_view(this, { signal: this.#controller.signal });
    }
    remove() {
      this.#controller.abort("[anywidget] View destroyed.");
      super.remove();
    }
  }

  return { AnyModel, AnyView };
}

;// CONCATENATED MODULE: ./packages/anywidget/src/plugin.js




/**
 * @typedef JupyterLabRegistry
 * @property {(widget: { name: string, version: string, exports: any }) => void} registerWidget
 */

/* export default */ const src_plugin = ({
  id: "anywidget:plugin",
  requires: [/** @type{unknown} */ (base_6_strict_.IJupyterWidgetRegistry)],
  activate: (/** @type {unknown} */ _app, /** @type {JupyterLabRegistry} */ registry) => {
    let exports = src_widget(base_6_strict_);
    registry.registerWidget({
      name: "anywidget",
      // @ts-expect-error Added by bundler
      version: "0.10.0",
      exports,
    });
  },
  autoStart: true,
});


},

}]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiOTUxLmE2NjY0OTVhLmpzIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vQGFueXdpZGdldC9tb25vcmVwby8uL3BhY2thZ2VzL2FueXdpZGdldC9zcmMvd2lkZ2V0LmpzIiwid2VicGFjazovL0Bhbnl3aWRnZXQvbW9ub3JlcG8vLi9wYWNrYWdlcy9hbnl3aWRnZXQvc3JjL3BsdWdpbi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyB1dWlkIGZyb20gXCJAbHVrZWVkL3V1aWRcIjtcbmltcG9ydCAqIGFzIHNvbGlkIGZyb20gXCJzb2xpZC1qc1wiO1xuXG4vKiogQGltcG9ydCB7IERPTVdpZGdldE1vZGVsLCBET01XaWRnZXRWaWV3IH0gZnJvbSBcIkBqdXB5dGVyLXdpZGdldHMvYmFzZVwiICovXG4vKiogQGltcG9ydCB7IEluaXRpYWxpemUsIFJlbmRlciwgQW55TW9kZWwgfSBmcm9tIFwiQGFueXdpZGdldC90eXBlc1wiICovXG5cbi8qKlxuICogQHRlbXBsYXRlIFRcbiAqIEB0eXBlZGVmIHtUIHwgUHJvbWlzZUxpa2U8VD59IEF3YWl0YWJsZVxuICovXG5cbi8qKlxuICogQHR5cGVkZWYgQW55V2lkZ2V0XG4gKiBAcHJvcCBpbml0aWFsaXplIHtJbml0aWFsaXplfVxuICogQHByb3AgcmVuZGVyIHtSZW5kZXJ9XG4gKi9cblxuLyoqXG4gKiAgQHR5cGVkZWYgQW55V2lkZ2V0TW9kdWxlXG4gKiAgQHByb3AgcmVuZGVyIHtSZW5kZXI9fVxuICogIEBwcm9wIGRlZmF1bHQge0FueVdpZGdldCB8ICgoKSA9PiBBbnlXaWRnZXQgfCBQcm9taXNlPEFueVdpZGdldD4pPX1cbiAqL1xuXG4vKipcbiAqIEBwYXJhbSB7dW5rbm93bn0gY29uZGl0aW9uXG4gKiBAcGFyYW0ge3N0cmluZ30gbWVzc2FnZVxuICogQHJldHVybnMge2Fzc2VydHMgY29uZGl0aW9ufVxuICovXG5mdW5jdGlvbiBhc3NlcnQoY29uZGl0aW9uLCBtZXNzYWdlKSB7XG4gIGlmICghY29uZGl0aW9uKSB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IHN0clxuICogQHJldHVybnMge3N0ciBpcyBcImh0dHBzOi8vJHtzdHJpbmd9XCIgfCBcImh0dHA6Ly8ke3N0cmluZ31cIn1cbiAqL1xuZnVuY3Rpb24gaXNfaHJlZihzdHIpIHtcbiAgcmV0dXJuIHN0ci5zdGFydHNXaXRoKFwiaHR0cDovL1wiKSB8fCBzdHIuc3RhcnRzV2l0aChcImh0dHBzOi8vXCIpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBocmVmXG4gKiBAcGFyYW0ge3N0cmluZ30gYW55d2lkZ2V0X2lkXG4gKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn1cbiAqL1xuYXN5bmMgZnVuY3Rpb24gbG9hZF9jc3NfaHJlZihocmVmLCBhbnl3aWRnZXRfaWQpIHtcbiAgLyoqIEB0eXBlIHtIVE1MTGlua0VsZW1lbnQgfCBudWxsfSAqL1xuICBsZXQgcHJldiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYGxpbmtbaWQ9JyR7YW55d2lkZ2V0X2lkfSddYCk7XG5cbiAgLy8gQWRhcHRlZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS92aXRlanMvdml0ZS9ibG9iL2Q1OWUxYWNjMmVmYzAzMDc0ODgzNjRlOWYyZmFkNTI4ZWM1N2YyMDQvcGFja2FnZXMvdml0ZS9zcmMvY2xpZW50L2NsaWVudC50cyNMMTg1LUwyMDFcbiAgLy8gU3dhcHMgb3V0IG9sZCBzdHlsZXMgd2l0aCBuZXcsIGJ1dCBhdm9pZHMgZmxhc2ggb2YgdW5zdHlsZWQgY29udGVudC5cbiAgLy8gTm8gbmVlZCB0byBhd2FpdCB0aGUgbG9hZCBzaW5jZSB3ZSBhbHJlYWR5IGhhdmUgc3R5bGVzIGFwcGxpZWQuXG4gIGlmIChwcmV2KSB7XG4gICAgLyoqIEB0eXBlIHtIVE1MTGlua0VsZW1lbnR9ICovXG4gICAgLy8gQHRzLWV4cGVjdC1lcnJvciAtIHdlIGtub3cgaXQncyBhbiBIVE1MTGlua0VsZW1lbnQgYmVjYXVzZSBwcmV2IGlzIGFuIEhUTUxMaW5rRWxlbWVudFxuICAgIGxldCBuZXdMaW5rID0gcHJldi5jbG9uZU5vZGUoKTtcbiAgICBuZXdMaW5rLmhyZWYgPSBocmVmO1xuICAgIG5ld0xpbmsuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIiwgKCkgPT4gcHJldj8ucmVtb3ZlKCkpO1xuICAgIG5ld0xpbmsuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsICgpID0+IHByZXY/LnJlbW92ZSgpKTtcbiAgICBwcmV2LmFmdGVyKG5ld0xpbmspO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGxldCBsaW5rID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlua1wiKSwge1xuICAgICAgcmVsOiBcInN0eWxlc2hlZXRcIixcbiAgICAgIGhyZWYsXG4gICAgICBvbmxvYWQ6IHJlc29sdmUsXG4gICAgfSk7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChsaW5rKTtcbiAgfSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IGNzc190ZXh0XG4gKiBAcGFyYW0ge3N0cmluZ30gYW55d2lkZ2V0X2lkXG4gKiBAcmV0dXJucyB7dm9pZH1cbiAqL1xuZnVuY3Rpb24gbG9hZF9jc3NfdGV4dChjc3NfdGV4dCwgYW55d2lkZ2V0X2lkKSB7XG4gIC8qKiBAdHlwZSB7SFRNTFN0eWxlRWxlbWVudCB8IG51bGx9ICovXG4gIGxldCBwcmV2ID0gZG9jdW1lbnQucXVlcnlTZWxlY3Rvcihgc3R5bGVbaWQ9JyR7YW55d2lkZ2V0X2lkfSddYCk7XG4gIGlmIChwcmV2KSB7XG4gICAgLy8gcmVwbGFjZSBpbnN0ZWFkIG9mIGNyZWF0aW5nIGEgbmV3IERPTSBub2RlXG4gICAgcHJldi50ZXh0Q29udGVudCA9IGNzc190ZXh0O1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgc3R5bGUgPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzdHlsZVwiKSwge1xuICAgIGlkOiBhbnl3aWRnZXRfaWQsXG4gICAgdHlwZTogXCJ0ZXh0L2Nzc1wiLFxuICB9KTtcbiAgc3R5bGUuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoY3NzX3RleHQpKTtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmcgfCB1bmRlZmluZWR9IGNzc1xuICogQHBhcmFtIHtzdHJpbmd9IGFueXdpZGdldF9pZFxuICogQHJldHVybnMge1Byb21pc2U8dm9pZD59XG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGxvYWRfY3NzKGNzcywgYW55d2lkZ2V0X2lkKSB7XG4gIGlmICghY3NzIHx8ICFhbnl3aWRnZXRfaWQpIHJldHVybjtcbiAgaWYgKGlzX2hyZWYoY3NzKSkgcmV0dXJuIGxvYWRfY3NzX2hyZWYoY3NzLCBhbnl3aWRnZXRfaWQpO1xuICByZXR1cm4gbG9hZF9jc3NfdGV4dChjc3MsIGFueXdpZGdldF9pZCk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IGVzbVxuICogQHJldHVybnMge1Byb21pc2U8QW55V2lkZ2V0TW9kdWxlPn1cbiAqL1xuYXN5bmMgZnVuY3Rpb24gbG9hZF9lc20oZXNtKSB7XG4gIGlmIChpc19ocmVmKGVzbSkpIHtcbiAgICByZXR1cm4gYXdhaXQgaW1wb3J0KC8qIHdlYnBhY2tJZ25vcmU6IHRydWUgKi8gLyogQHZpdGUtaWdub3JlICovIGVzbSk7XG4gIH1cbiAgbGV0IHVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwobmV3IEJsb2IoW2VzbV0sIHsgdHlwZTogXCJ0ZXh0L2phdmFzY3JpcHRcIiB9KSk7XG4gIGxldCBtb2QgPSBhd2FpdCBpbXBvcnQoLyogd2VicGFja0lnbm9yZTogdHJ1ZSAqLyAvKiBAdml0ZS1pZ25vcmUgKi8gdXJsKTtcbiAgVVJMLnJldm9rZU9iamVjdFVSTCh1cmwpO1xuICByZXR1cm4gbW9kO1xufVxuXG4vKiogQHBhcmFtIHtzdHJpbmd9IGFueXdpZGdldF9pZCAqL1xuZnVuY3Rpb24gd2Fybl9yZW5kZXJfZGVwcmVjYXRpb24oYW55d2lkZ2V0X2lkKSB7XG4gIGNvbnNvbGUud2FybihgXFxcblthbnl3aWRnZXRdIERlcHJlY2F0aW9uIFdhcm5pbmcgZm9yICR7YW55d2lkZ2V0X2lkfTogRGlyZWN0IGV4cG9ydCBvZiBhICdyZW5kZXInIHdpbGwgbGlrZWx5IGJlIGRlcHJlY2F0ZWQgaW4gdGhlIGZ1dHVyZS4gVG8gbWlncmF0ZSAuLi5cblxuUmVtb3ZlIHRoZSAnZXhwb3J0JyBrZXl3b3JkIGZyb20gJ3JlbmRlcidcbi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXIoeyBtb2RlbCwgZWwgfSkgeyAuLi4gfVxuXl5eXl5eXG5cbkNyZWF0ZSBhIGRlZmF1bHQgZXhwb3J0IHRoYXQgcmV0dXJucyBhbiBvYmplY3Qgd2l0aCAncmVuZGVyJ1xuLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIHJlbmRlcih7IG1vZGVsLCBlbCB9KSB7IC4uLiB9XG4gICAgICAgICBeXl5eXl5cbmV4cG9ydCBkZWZhdWx0IHsgcmVuZGVyIH1cbiAgICAgICAgICAgICAgICAgXl5eXl5eXG5cblBpbiB0byBhbnl3aWRnZXQ+PTAuOS4wIGluIHlvdXIgcHlwcm9qZWN0LnRvbWxcbi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZGVwZW5kZW5jaWVzID0gW1wiYW55d2lkZ2V0Pj0wLjkuMFwiXVxuXG5UbyBsZWFybiBtb3JlLCBwbGVhc2Ugc2VlOiBodHRwczovL2dpdGh1Yi5jb20vbWFuenQvYW55d2lkZ2V0L3B1bGwvMzk1LlxuYCk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtzdHJpbmd9IGVzbVxuICogQHBhcmFtIHtzdHJpbmd9IGFueXdpZGdldF9pZFxuICogQHJldHVybnMge1Byb21pc2U8QW55V2lkZ2V0Pn1cbiAqL1xuYXN5bmMgZnVuY3Rpb24gbG9hZF93aWRnZXQoZXNtLCBhbnl3aWRnZXRfaWQpIHtcbiAgbGV0IG1vZCA9IGF3YWl0IGxvYWRfZXNtKGVzbSk7XG4gIGlmIChtb2QucmVuZGVyKSB7XG4gICAgd2Fybl9yZW5kZXJfZGVwcmVjYXRpb24oYW55d2lkZ2V0X2lkKTtcbiAgICByZXR1cm4ge1xuICAgICAgYXN5bmMgaW5pdGlhbGl6ZSgpIHt9LFxuICAgICAgcmVuZGVyOiBtb2QucmVuZGVyLFxuICAgIH07XG4gIH1cbiAgYXNzZXJ0KG1vZC5kZWZhdWx0LCBgW2FueXdpZGdldF0gbW9kdWxlIG11c3QgZXhwb3J0IGEgZGVmYXVsdCBmdW5jdGlvbiBvciBvYmplY3QuYCk7XG4gIGxldCB3aWRnZXQgPSB0eXBlb2YgbW9kLmRlZmF1bHQgPT09IFwiZnVuY3Rpb25cIiA/IGF3YWl0IG1vZC5kZWZhdWx0KCkgOiBtb2QuZGVmYXVsdDtcbiAgcmV0dXJuIHdpZGdldDtcbn1cblxuLyoqXG4gKiBUaGlzIGlzIGEgdHJpY2sgc28gdGhhdCB3ZSBjYW4gY2xlYW51cCBldmVudCBsaXN0ZW5lcnMgYWRkZWRcbiAqIGJ5IHRoZSB1c2VyLWRlZmluZWQgZnVuY3Rpb24uXG4gKi9cbmxldCBJTklUSUFMSVpFX01BUktFUiA9IFN5bWJvbChcImFueXdpZGdldC5pbml0aWFsaXplXCIpO1xuXG4vKipcbiAqIEBwYXJhbSB7RE9NV2lkZ2V0TW9kZWx9IG1vZGVsXG4gKiBAcGFyYW0ge3Vua25vd259IGNvbnRleHRcbiAqIEByZXR1cm4ge2ltcG9ydChcIkBhbnl3aWRnZXQvdHlwZXNcIikuQW55TW9kZWx9XG4gKlxuICogUHJ1bmVzIHRoZSB2aWV3IGRvd24gdG8gdGhlIG1pbmltdW0gY29udGV4dCBuZWNlc3NhcnkuXG4gKlxuICogQ2FsbHMgdG8gYG1vZGVsLmdldGAgYW5kIGBtb2RlbC5zZXRgIGF1dG9tYXRpY2FsbHkgYWRkIHRoZVxuICogYGNvbnRleHRgLCBzbyB3ZSBjYW4gZ3JhY2VmdWxseSB1bnN1YnNjcmliZSBmcm9tIGV2ZW50c1xuICogYWRkZWQgYnkgdXNlci1kZWZpbmVkIGhvb2tzLlxuICovXG5mdW5jdGlvbiBtb2RlbF9wcm94eShtb2RlbCwgY29udGV4dCkge1xuICByZXR1cm4ge1xuICAgIGdldDogbW9kZWwuZ2V0LmJpbmQobW9kZWwpLFxuICAgIHNldDogbW9kZWwuc2V0LmJpbmQobW9kZWwpLFxuICAgIHNhdmVfY2hhbmdlczogbW9kZWwuc2F2ZV9jaGFuZ2VzLmJpbmQobW9kZWwpLFxuICAgIHNlbmQ6IG1vZGVsLnNlbmQuYmluZChtb2RlbCksXG4gICAgb24obmFtZSwgY2FsbGJhY2spIHtcbiAgICAgIG1vZGVsLm9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KTtcbiAgICB9LFxuICAgIG9mZihuYW1lLCBjYWxsYmFjaykge1xuICAgICAgbW9kZWwub2ZmKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KTtcbiAgICB9LFxuICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgLSB0aGUgd2lkZ2V0X21hbmFnZXIgdHlwZSBpcyB3aWRlciB0aGFuIHdoYXRcbiAgICAvLyB3ZSB3YW50IHRvIGV4cG9zZSB0byBkZXZlbG9wZXJzLlxuICAgIC8vIEluIGEgZnV0dXJlIHZlcnNpb24sIHdlIHdpbGwgZXhwb3NlIGEgbW9yZSBsaW1pdGVkIEFQSSBidXRcbiAgICAvLyB0aGF0IGNhbiB3YWl0IGZvciBhIG1pbm9yIHZlcnNpb24gYnVtcC5cbiAgICB3aWRnZXRfbWFuYWdlcjogbW9kZWwud2lkZ2V0X21hbmFnZXIsXG4gIH07XG59XG5cbi8qKlxuICogQHBhcmFtIHt2b2lkIHwgKCgpID0+IEF3YWl0YWJsZTx2b2lkPil9IGZuXG4gKiBAcGFyYW0ge3N0cmluZ30ga2luZFxuICovXG5hc3luYyBmdW5jdGlvbiBzYWZlX2NsZWFudXAoZm4sIGtpbmQpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4gZm4/LigpKVxuICAgIC5jYXRjaCgoZSkgPT4gY29uc29sZS53YXJuKGBbYW55d2lkZ2V0XSBlcnJvciBjbGVhbmluZyB1cCAke2tpbmR9LmAsIGUpKTtcbn1cblxuLyoqXG4gKiBAdGVtcGxhdGUgVFxuICogQHR5cGVkZWYgUmVhZHlcbiAqIEBwcm9wZXJ0eSB7XCJyZWFkeVwifSBzdGF0dXNcbiAqIEBwcm9wZXJ0eSB7VH0gZGF0YVxuICovXG5cbi8qKlxuICogQHR5cGVkZWYgUGVuZGluZ1xuICogQHByb3BlcnR5IHtcInBlbmRpbmdcIn0gc3RhdHVzXG4gKi9cblxuLyoqXG4gKiBAdHlwZWRlZiBFcnJvcmVkXG4gKiBAcHJvcGVydHkge1wiZXJyb3JcIn0gc3RhdHVzXG4gKiBAcHJvcGVydHkge3Vua25vd259IGVycm9yXG4gKi9cblxuLyoqXG4gKiBAdGVtcGxhdGUgVFxuICogQHR5cGVkZWYge1BlbmRpbmcgfCBSZWFkeTxUPiB8IEVycm9yZWR9IFJlc3VsdFxuICovXG5cbi8qKlxuICogQ2xlYW5zIHVwIHRoZSBzdGFjayB0cmFjZSBhdCBhbnl3aWRnZXQgYm91bmRhcnkuXG4gKiBZb3UgY2FuIGZ1bGx5IGluc3BlY3QgdGhlIGVudGlyZSBzdGFjayB0cmFjZSBpbiB0aGUgY29uc29sZSBpbnRlcmFjdGl2ZWx5LFxuICogYnV0IHRoZSBpbml0aWFsIGVycm9yIG1lc3NhZ2UgaXMgY2xlYW5lZCB1cCB0byBiZSBtb3JlIHVzZXItZnJpZW5kbHkuXG4gKlxuICogQHBhcmFtIHt1bmtub3dufSBzb3VyY2VcbiAqL1xuZnVuY3Rpb24gdGhyb3dfYW55d2lkZ2V0X2Vycm9yKHNvdXJjZSkge1xuICBpZiAoIShzb3VyY2UgaW5zdGFuY2VvZiBFcnJvcikpIHtcbiAgICAvLyBEb24ndCBrbm93IHdoYXQgdG8gZG8gd2l0aCB0aGlzLlxuICAgIHRocm93IHNvdXJjZTtcbiAgfVxuICBsZXQgbGluZXMgPSBzb3VyY2Uuc3RhY2s/LnNwbGl0KFwiXFxuXCIpID8/IFtdO1xuICBsZXQgYW55d2lkZ2V0X2luZGV4ID0gbGluZXMuZmluZEluZGV4KChsaW5lKSA9PiBsaW5lLmluY2x1ZGVzKFwiYW55d2lkZ2V0XCIpKTtcbiAgbGV0IGNsZWFuX3N0YWNrID0gYW55d2lkZ2V0X2luZGV4ID09PSAtMSA/IGxpbmVzIDogbGluZXMuc2xpY2UoMCwgYW55d2lkZ2V0X2luZGV4ICsgMSk7XG4gIHNvdXJjZS5zdGFjayA9IGNsZWFuX3N0YWNrLmpvaW4oXCJcXG5cIik7XG4gIGNvbnNvbGUuZXJyb3Ioc291cmNlKTtcbiAgdGhyb3cgc291cmNlO1xufVxuXG4vKipcbiAqIEB0eXBlZGVmIEludm9rZU9wdGlvbnNcbiAqIEBwcm9wIHtEYXRhVmlld1tdfSBbYnVmZmVyc11cbiAqIEBwcm9wIHtBYm9ydFNpZ25hbH0gW3NpZ25hbF1cbiAqL1xuXG4vKipcbiAqIEB0ZW1wbGF0ZSBUXG4gKiBAcGFyYW0ge2ltcG9ydChcIkBhbnl3aWRnZXQvdHlwZXNcIikuQW55TW9kZWx9IG1vZGVsXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHBhcmFtIHthbnl9IFttc2ddXG4gKiBAcGFyYW0ge0ludm9rZU9wdGlvbnN9IFtvcHRpb25zXVxuICogQHJldHVybiB7UHJvbWlzZTxbVCwgRGF0YVZpZXdbXV0+fVxuICovXG5leHBvcnQgZnVuY3Rpb24gaW52b2tlKG1vZGVsLCBuYW1lLCBtc2csIG9wdGlvbnMgPSB7fSkge1xuICAvLyBjcnlwdG8ucmFuZG9tVVVJRCgpIGlzIG5vdCBhdmFpbGFibGUgaW4gbm9uLXNlY3VyZSBjb250ZXh0cyAoaS5lLiwgaHR0cDovLylcbiAgLy8gc28gd2UgdXNlIHNpbXBsZSAobm9uLXNlY3VyZSkgcG9seWZpbGwuXG4gIGxldCBpZCA9IHV1aWQudjQoKTtcbiAgbGV0IHNpZ25hbCA9IG9wdGlvbnMuc2lnbmFsID8/IEFib3J0U2lnbmFsLnRpbWVvdXQoMzAwMCk7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBpZiAoc2lnbmFsLmFib3J0ZWQpIHtcbiAgICAgIHJlamVjdChzaWduYWwucmVhc29uKTtcbiAgICB9XG4gICAgc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCAoKSA9PiB7XG4gICAgICBtb2RlbC5vZmYoXCJtc2c6Y3VzdG9tXCIsIGhhbmRsZXIpO1xuICAgICAgcmVqZWN0KHNpZ25hbC5yZWFzb24pO1xuICAgIH0pO1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHt7IGlkOiBzdHJpbmcsIGtpbmQ6IFwiYW55d2lkZ2V0LWNvbW1hbmQtcmVzcG9uc2VcIiwgcmVzcG9uc2U6IFQgfX0gbXNnXG4gICAgICogQHBhcmFtIHtEYXRhVmlld1tdfSBidWZmZXJzXG4gICAgICovXG4gICAgZnVuY3Rpb24gaGFuZGxlcihtc2csIGJ1ZmZlcnMpIHtcbiAgICAgIGlmICghKG1zZy5pZCA9PT0gaWQpKSByZXR1cm47XG4gICAgICByZXNvbHZlKFttc2cucmVzcG9uc2UsIGJ1ZmZlcnNdKTtcbiAgICAgIG1vZGVsLm9mZihcIm1zZzpjdXN0b21cIiwgaGFuZGxlcik7XG4gICAgfVxuICAgIG1vZGVsLm9uKFwibXNnOmN1c3RvbVwiLCBoYW5kbGVyKTtcbiAgICBtb2RlbC5zZW5kKHsgaWQsIGtpbmQ6IFwiYW55d2lkZ2V0LWNvbW1hbmRcIiwgbmFtZSwgbXNnIH0sIHVuZGVmaW5lZCwgb3B0aW9ucy5idWZmZXJzID8/IFtdKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUG9seWZpbGwgZm9yIHtAbGluayBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9Qcm9taXNlL3dpdGhSZXNvbHZlcnMgUHJvbWlzZS53aXRoUmVzb2x2ZXJzfVxuICpcbiAqIFRyZXZvcigyMDI1LTAzLTE0KTogU2hvdWxkIGJlIGFibGUgdG8gcmVtb3ZlIG9uY2UgbW9yZSBzdGFibGUgYWNyb3NzIGJyb3dzZXJzLlxuICpcbiAqIEB0ZW1wbGF0ZSBUXG4gKiBAcmV0dXJucyB7UHJvbWlzZVdpdGhSZXNvbHZlcnM8VD59XG4gKi9cbmZ1bmN0aW9uIHByb21pc2Vfd2l0aF9yZXNvbHZlcnMoKSB7XG4gIGxldCByZXNvbHZlO1xuICBsZXQgcmVqZWN0O1xuICBsZXQgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4ge1xuICAgIHJlc29sdmUgPSByZXM7XG4gICAgcmVqZWN0ID0gcmVqO1xuICB9KTtcbiAgLy8gQHRzLWV4cGVjdC1lcnJvciAtIFdlIGtub3cgdGhlc2UgdHlwZXMgYXJlIG9rXG4gIHJldHVybiB7IHByb21pc2UsIHJlc29sdmUsIHJlamVjdCB9O1xufVxuXG4vKipcbiAqIEB0ZW1wbGF0ZSB7UmVjb3JkPHN0cmluZywgdW5rbm93bj59IFRcbiAqIEB0ZW1wbGF0ZSB7a2V5b2YgVCAmIHN0cmluZ30gS1xuICogQHBhcmFtIHtBbnlNb2RlbDxUPn0gbW9kZWxcbiAqIEBwYXJhbSB7S30gbmFtZVxuICogQHBhcmFtIHt7IHNpZ25hbD86IEFib3J0U2lnbmFsfX0gb3B0aW9uc1xuICogQHJldHVybnMge3NvbGlkLkFjY2Vzc29yPFRbS10+fVxuICovXG5mdW5jdGlvbiBvYnNlcnZlKG1vZGVsLCBuYW1lLCB7IHNpZ25hbCB9KSB7XG4gIGxldCBbZ2V0LCBzZXRdID0gc29saWQuY3JlYXRlU2lnbmFsKG1vZGVsLmdldChuYW1lKSk7XG4gIGxldCB1cGRhdGUgPSAoKSA9PiBzZXQoKCkgPT4gbW9kZWwuZ2V0KG5hbWUpKTtcbiAgbW9kZWwub24oYGNoYW5nZToke25hbWV9YCwgdXBkYXRlKTtcbiAgc2lnbmFsPy5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgKCkgPT4ge1xuICAgIG1vZGVsLm9mZihgY2hhbmdlOiR7bmFtZX1gLCB1cGRhdGUpO1xuICB9KTtcbiAgcmV0dXJuIGdldDtcbn1cblxuLyoqXG4gKiBAdHlwZWRlZiBTdGF0ZVxuICogQHByb3BlcnR5IHtzdHJpbmd9IF9lc21cbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBfYW55d2lkZ2V0X2lkXG4gKiBAcHJvcGVydHkge3N0cmluZyB8IHVuZGVmaW5lZH0gX2Nzc1xuICovXG5cbmNsYXNzIFJ1bnRpbWUge1xuICAvKiogQHR5cGUge3NvbGlkLkFjY2Vzc29yPFJlc3VsdDxBbnlXaWRnZXQ+Pn0gKi9cbiAgLy8gQHRzLWV4cGVjdC1lcnJvciAtIFNldCBzeW5jaHJvbm91c2x5IGluIGNvbnN0cnVjdG9yLlxuICAjd2lkZ2V0X3Jlc3VsdDtcbiAgLyoqIEB0eXBlIHtBYm9ydFNpZ25hbH0gKi9cbiAgI3NpZ25hbDtcbiAgLyoqIEB0eXBlIHtQcm9taXNlPHZvaWQ+fSAqL1xuICByZWFkeTtcblxuICAvKipcbiAgICogQHBhcmFtIHtET01XaWRnZXRNb2RlbH0gbW9kZWxcbiAgICogQHBhcmFtIHt7IHNpZ25hbDogQWJvcnRTaWduYWwgfX0gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3IobW9kZWwsIG9wdGlvbnMpIHtcbiAgICAvKiogQHR5cGUge1Byb21pc2VXaXRoUmVzb2x2ZXJzPHZvaWQ+fSAqL1xuICAgIGxldCByZXNvbHZlcnMgPSBwcm9taXNlX3dpdGhfcmVzb2x2ZXJzKCk7XG4gICAgdGhpcy5yZWFkeSA9IHJlc29sdmVycy5wcm9taXNlO1xuICAgIHRoaXMuI3NpZ25hbCA9IG9wdGlvbnMuc2lnbmFsO1xuICAgIHRoaXMuI3NpZ25hbC50aHJvd0lmQWJvcnRlZCgpO1xuICAgIHRoaXMuI3NpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgKCkgPT4gZGlzcG9zZSgpKTtcbiAgICBBYm9ydFNpZ25hbC50aW1lb3V0KDIwMDApLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCAoKSA9PiB7XG4gICAgICByZXNvbHZlcnMucmVqZWN0KG5ldyBFcnJvcihcIlthbnl3aWRnZXRdIEZhaWxlZCB0byBpbml0aWFsaXplIG1vZGVsLlwiKSk7XG4gICAgfSk7XG4gICAgbGV0IGRpc3Bvc2UgPSBzb2xpZC5jcmVhdGVSb290KChkaXNwb3NlKSA9PiB7XG4gICAgICAvKiogQHR5cGUge0FueU1vZGVsPFN0YXRlPn0gKi9cbiAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgLSBUeXBlcyBkb24ndCBzdWZmaWNpZW50bHkgb3ZlcmxhcCwgc28gd2UgY2FzdCBoZXJlIGZvciB0eXBlLXNhZmUgYWNjZXNzXG4gICAgICBsZXQgdHlwZWRfbW9kZWwgPSBtb2RlbDtcbiAgICAgIGxldCBpZCA9IHR5cGVkX21vZGVsLmdldChcIl9hbnl3aWRnZXRfaWRcIik7XG4gICAgICBsZXQgY3NzID0gb2JzZXJ2ZSh0eXBlZF9tb2RlbCwgXCJfY3NzXCIsIHsgc2lnbmFsOiB0aGlzLiNzaWduYWwgfSk7XG4gICAgICBsZXQgZXNtID0gb2JzZXJ2ZSh0eXBlZF9tb2RlbCwgXCJfZXNtXCIsIHsgc2lnbmFsOiB0aGlzLiNzaWduYWwgfSk7XG4gICAgICBsZXQgW3dpZGdldF9yZXN1bHQsIHNldF93aWRnZXRfcmVzdWx0XSA9IHNvbGlkLmNyZWF0ZVNpZ25hbChcbiAgICAgICAgLyoqIEB0eXBlIHtSZXN1bHQ8QW55V2lkZ2V0Pn0gKi8gKHsgc3RhdHVzOiBcInBlbmRpbmdcIiB9KSxcbiAgICAgICk7XG4gICAgICB0aGlzLiN3aWRnZXRfcmVzdWx0ID0gd2lkZ2V0X3Jlc3VsdDtcblxuICAgICAgc29saWQuY3JlYXRlRWZmZWN0KFxuICAgICAgICBzb2xpZC5vbihjc3MsICgpID0+IGNvbnNvbGUuZGVidWcoYFthbnl3aWRnZXRdIGNzcyBob3QgdXBkYXRlZDogJHtpZH1gKSwgeyBkZWZlcjogdHJ1ZSB9KSxcbiAgICAgICk7XG4gICAgICBzb2xpZC5jcmVhdGVFZmZlY3QoXG4gICAgICAgIHNvbGlkLm9uKGVzbSwgKCkgPT4gY29uc29sZS5kZWJ1ZyhgW2FueXdpZGdldF0gZXNtIGhvdCB1cGRhdGVkOiAke2lkfWApLCB7IGRlZmVyOiB0cnVlIH0pLFxuICAgICAgKTtcbiAgICAgIHNvbGlkLmNyZWF0ZUVmZmVjdCgoKSA9PiB7XG4gICAgICAgIHJldHVybiBsb2FkX2Nzcyhjc3MoKSwgaWQpO1xuICAgICAgfSk7XG4gICAgICBzb2xpZC5jcmVhdGVFZmZlY3QoKCkgPT4ge1xuICAgICAgICBsZXQgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICAgICAgc29saWQub25DbGVhbnVwKCgpID0+IGNvbnRyb2xsZXIuYWJvcnQoKSk7XG4gICAgICAgIG1vZGVsLm9mZihudWxsLCBudWxsLCBJTklUSUFMSVpFX01BUktFUik7XG4gICAgICAgIGxvYWRfd2lkZ2V0KGVzbSgpLCBpZClcbiAgICAgICAgICAudGhlbihhc3luYyAod2lkZ2V0KSA9PiB7XG4gICAgICAgICAgICBpZiAoY29udHJvbGxlci5zaWduYWwuYWJvcnRlZCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgY2xlYW51cCA9IGF3YWl0IHdpZGdldC5pbml0aWFsaXplPy4oe1xuICAgICAgICAgICAgICBtb2RlbDogbW9kZWxfcHJveHkobW9kZWwsIElOSVRJQUxJWkVfTUFSS0VSKSxcbiAgICAgICAgICAgICAgZXhwZXJpbWVudGFsOiB7XG4gICAgICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciAtIGJpbmQgaXNuJ3Qgd29ya2luZ1xuICAgICAgICAgICAgICAgIGludm9rZTogaW52b2tlLmJpbmQobnVsbCwgbW9kZWwpLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoY29udHJvbGxlci5zaWduYWwuYWJvcnRlZCkge1xuICAgICAgICAgICAgICByZXR1cm4gc2FmZV9jbGVhbnVwKGNsZWFudXAsIFwiZXNtIHVwZGF0ZVwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRyb2xsZXIuc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCAoKSA9PiBzYWZlX2NsZWFudXAoY2xlYW51cCwgXCJlc20gdXBkYXRlXCIpKTtcbiAgICAgICAgICAgIHNldF93aWRnZXRfcmVzdWx0KHsgc3RhdHVzOiBcInJlYWR5XCIsIGRhdGE6IHdpZGdldCB9KTtcbiAgICAgICAgICAgIHJlc29sdmVycy5yZXNvbHZlKCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiBzZXRfd2lkZ2V0X3Jlc3VsdCh7IHN0YXR1czogXCJlcnJvclwiLCBlcnJvciB9KSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGRpc3Bvc2U7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQHBhcmFtIHtET01XaWRnZXRWaWV3fSB2aWV3XG4gICAqIEBwYXJhbSB7eyBzaWduYWw6IEFib3J0U2lnbmFsIH19IG9wdGlvbnNcbiAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59XG4gICAqL1xuICBhc3luYyBjcmVhdGVfdmlldyh2aWV3LCBvcHRpb25zKSB7XG4gICAgbGV0IG1vZGVsID0gdmlldy5tb2RlbDtcbiAgICBsZXQgc2lnbmFsID0gQWJvcnRTaWduYWwuYW55KFt0aGlzLiNzaWduYWwsIG9wdGlvbnMuc2lnbmFsXSk7IC8vIGVpdGhlciBtb2RlbCBvciB2aWV3IGRlc3Ryb3llZFxuICAgIHNpZ25hbC50aHJvd0lmQWJvcnRlZCgpO1xuICAgIHNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgKCkgPT4gZGlzcG9zZSgpKTtcbiAgICBsZXQgZGlzcG9zZSA9IHNvbGlkLmNyZWF0ZVJvb3QoKGRpc3Bvc2UpID0+IHtcbiAgICAgIHNvbGlkLmNyZWF0ZUVmZmVjdCgoKSA9PiB7XG4gICAgICAgIC8vIENsZWFyIGFsbCBwcmV2aW91cyBldmVudCBsaXN0ZW5lcnMgZnJvbSB0aGlzIGhvb2suXG4gICAgICAgIG1vZGVsLm9mZihudWxsLCBudWxsLCB2aWV3KTtcbiAgICAgICAgdmlldy4kZWwuZW1wdHkoKTtcbiAgICAgICAgbGV0IHJlc3VsdCA9IHRoaXMuI3dpZGdldF9yZXN1bHQoKTtcbiAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09IFwicGVuZGluZ1wiKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSBcImVycm9yXCIpIHtcbiAgICAgICAgICB0aHJvd19hbnl3aWRnZXRfZXJyb3IocmVzdWx0LmVycm9yKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgICAgIHNvbGlkLm9uQ2xlYW51cCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCkpO1xuICAgICAgICBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGxldCBjbGVhbnVwID0gYXdhaXQgcmVzdWx0LmRhdGEucmVuZGVyPy4oe1xuICAgICAgICAgICAgICBtb2RlbDogbW9kZWxfcHJveHkobW9kZWwsIHZpZXcpLFxuICAgICAgICAgICAgICBlbDogdmlldy5lbCxcbiAgICAgICAgICAgICAgZXhwZXJpbWVudGFsOiB7XG4gICAgICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciAtIGJpbmQgaXNuJ3Qgd29ya2luZ1xuICAgICAgICAgICAgICAgIGludm9rZTogaW52b2tlLmJpbmQobnVsbCwgbW9kZWwpLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoY29udHJvbGxlci5zaWduYWwuYWJvcnRlZCkge1xuICAgICAgICAgICAgICByZXR1cm4gc2FmZV9jbGVhbnVwKGNsZWFudXAsIFwiZGlzcG9zZSB2aWV3IC0gYWxyZWFkeSBhYm9ydGVkXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udHJvbGxlci5zaWduYWwuYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsICgpID0+XG4gICAgICAgICAgICAgIHNhZmVfY2xlYW51cChjbGVhbnVwLCBcImRpc3Bvc2UgdmlldyAtIGFib3J0ZWRcIiksXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKChlcnJvcikgPT4gdGhyb3dfYW55d2lkZ2V0X2Vycm9yKGVycm9yKSk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiAoKSA9PiBkaXNwb3NlKCk7XG4gICAgfSk7XG4gIH1cbn1cblxuLy8gQHRzLWV4cGVjdC1lcnJvciAtIGluamVjdGVkIGJ5IGJ1bmRsZXJcbmxldCB2ZXJzaW9uID0gZ2xvYmFsVGhpcy5WRVJTSU9OO1xuXG4vKipcbiAqIEBwYXJhbSB7e1xuICogICBET01XaWRnZXRNb2RlbDogdHlwZW9mIGltcG9ydChcIkBqdXB5dGVyLXdpZGdldHMvYmFzZVwiKS5ET01XaWRnZXRNb2RlbCxcbiAqICAgRE9NV2lkZ2V0VmlldzogdHlwZW9mIGltcG9ydChcIkBqdXB5dGVyLXdpZGdldHMvYmFzZVwiKS5ET01XaWRnZXRWaWV3XG4gKiB9fSBvcHRpb25zXG4gKiBAcmV0dXJucyB7eyBBbnlNb2RlbDogdHlwZW9mIGltcG9ydChcIkBqdXB5dGVyLXdpZGdldHMvYmFzZVwiKS5ET01XaWRnZXRNb2RlbCwgQW55VmlldzogdHlwZW9mIGltcG9ydChcIkBqdXB5dGVyLXdpZGdldHMvYmFzZVwiKS5ET01XaWRnZXRWaWV3IH19XG4gKi9cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uICh7IERPTVdpZGdldE1vZGVsLCBET01XaWRnZXRWaWV3IH0pIHtcbiAgLyoqIEB0eXBlIHtXZWFrTWFwPEFueU1vZGVsLCBSdW50aW1lPn0gKi9cbiAgbGV0IFJVTlRJTUVTID0gbmV3IFdlYWtNYXAoKTtcblxuICBjbGFzcyBBbnlNb2RlbCBleHRlbmRzIERPTVdpZGdldE1vZGVsIHtcbiAgICBzdGF0aWMgbW9kZWxfbmFtZSA9IFwiQW55TW9kZWxcIjtcbiAgICBzdGF0aWMgbW9kZWxfbW9kdWxlID0gXCJhbnl3aWRnZXRcIjtcbiAgICBzdGF0aWMgbW9kZWxfbW9kdWxlX3ZlcnNpb24gPSB2ZXJzaW9uO1xuXG4gICAgc3RhdGljIHZpZXdfbmFtZSA9IFwiQW55Vmlld1wiO1xuICAgIHN0YXRpYyB2aWV3X21vZHVsZSA9IFwiYW55d2lkZ2V0XCI7XG4gICAgc3RhdGljIHZpZXdfbW9kdWxlX3ZlcnNpb24gPSB2ZXJzaW9uO1xuXG4gICAgLyoqIEBwYXJhbSB7UGFyYW1ldGVyczxJbnN0YW5jZVR5cGU8dHlwZW9mIERPTVdpZGdldE1vZGVsPltcImluaXRpYWxpemVcIl0+fSBhcmdzICovXG4gICAgaW5pdGlhbGl6ZSguLi5hcmdzKSB7XG4gICAgICBzdXBlci5pbml0aWFsaXplKC4uLmFyZ3MpO1xuICAgICAgbGV0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgICB0aGlzLm9uY2UoXCJkZXN0cm95XCIsICgpID0+IHtcbiAgICAgICAgY29udHJvbGxlci5hYm9ydChcIlthbnl3aWRnZXRdIFJ1bnRpbWUgZGVzdHJveWVkLlwiKTtcbiAgICAgICAgUlVOVElNRVMuZGVsZXRlKHRoaXMpO1xuICAgICAgfSk7XG4gICAgICBSVU5USU1FUy5zZXQodGhpcywgbmV3IFJ1bnRpbWUodGhpcywgeyBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsIH0pKTtcbiAgICB9XG5cbiAgICAvKiogQHBhcmFtIHtQYXJhbWV0ZXJzPEluc3RhbmNlVHlwZTx0eXBlb2YgRE9NV2lkZ2V0TW9kZWw+W1wiX2hhbmRsZV9jb21tX21zZ1wiXT59IG1zZyAqL1xuICAgIGFzeW5jIF9oYW5kbGVfY29tbV9tc2coLi4ubXNnKSB7XG4gICAgICBsZXQgcnVudGltZSA9IFJVTlRJTUVTLmdldCh0aGlzKTtcbiAgICAgIGF3YWl0IHJ1bnRpbWU/LnJlYWR5O1xuICAgICAgcmV0dXJuIHN1cGVyLl9oYW5kbGVfY29tbV9tc2coLi4ubXNnKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge1JlY29yZDxzdHJpbmcsIGFueT59IHN0YXRlXG4gICAgICpcbiAgICAgKiBXZSBvdmVycmlkZSB0byBzdXBwb3J0IGJpbmFyeSB0cmFpbGV0cyBiZWNhdXNlIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoKSlcbiAgICAgKiBkb2VzIG5vdCBwcm9wZXJseSBjbG9uZSBiaW5hcnkgZGF0YSAoaXQganVzdCByZXR1cm5zIGFuIGVtcHR5IG9iamVjdCkuXG4gICAgICpcbiAgICAgKiBodHRwczovL2dpdGh1Yi5jb20vanVweXRlci13aWRnZXRzL2lweXdpZGdldHMvYmxvYi80NzA1OGEzNzNkMmMyYjNhY2YxMDE2NzdiMjc0NWUxNGI3NmRkNzRiL3BhY2thZ2VzL2Jhc2Uvc3JjL3dpZGdldC50cyNMNTYyLUw1ODNcbiAgICAgKi9cbiAgICBzZXJpYWxpemUoc3RhdGUpIHtcbiAgICAgIC8vIG94bGludC1kaXNhYmxlLW5leHQtbGluZSB0eXBlc2NyaXB0LWVzbGludC9uby11bnNhZmUtdHlwZS1hc3NlcnRpb24gLS0gYWNjZXNzaW5nIHN0YXRpYyBgLnNlcmlhbGl6ZXJzYCBvbiBgdGhpcy5jb25zdHJ1Y3RvcmBcbiAgICAgIGxldCBzZXJpYWxpemVycyA9IC8qKiBAdHlwZSB7dHlwZW9mIERPTVdpZGdldE1vZGVsfSAqLyAodGhpcy5jb25zdHJ1Y3Rvcikuc2VyaWFsaXplcnMgfHwge307XG4gICAgICBmb3IgKGxldCBrIG9mIE9iamVjdC5rZXlzKHN0YXRlKSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCBzZXJpYWxpemUgPSBzZXJpYWxpemVyc1trXT8uc2VyaWFsaXplO1xuICAgICAgICAgIGlmIChzZXJpYWxpemUpIHtcbiAgICAgICAgICAgIHN0YXRlW2tdID0gc2VyaWFsaXplKHN0YXRlW2tdLCB0aGlzKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGsgPT09IFwibGF5b3V0XCIgfHwgayA9PT0gXCJzdHlsZVwiKSB7XG4gICAgICAgICAgICAvLyBUaGVzZSBrZXlzIGNvbWUgZnJvbSBpcHl3aWRnZXRzLCByZWx5IG9uIEpTT04uc3RyaW5naWZ5IHRyaWNrLlxuICAgICAgICAgICAgc3RhdGVba10gPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHN0YXRlW2tdKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YXRlW2tdID0gc3RydWN0dXJlZENsb25lKHN0YXRlW2tdKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiBzdGF0ZVtrXT8udG9KU09OID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIHN0YXRlW2tdID0gc3RhdGVba10udG9KU09OKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIHNlcmlhbGl6aW5nIHdpZGdldCBzdGF0ZSBhdHRyaWJ1dGU6IFwiLCBrKTtcbiAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RhdGU7XG4gICAgfVxuICB9XG5cbiAgY2xhc3MgQW55VmlldyBleHRlbmRzIERPTVdpZGdldFZpZXcge1xuICAgICNjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgIGFzeW5jIHJlbmRlcigpIHtcbiAgICAgIGxldCBydW50aW1lID0gUlVOVElNRVMuZ2V0KHRoaXMubW9kZWwpO1xuICAgICAgYXNzZXJ0KHJ1bnRpbWUsIFwiW2FueXdpZGdldF0gUnVudGltZSBub3QgZm91bmQuXCIpO1xuICAgICAgYXdhaXQgcnVudGltZS5jcmVhdGVfdmlldyh0aGlzLCB7IHNpZ25hbDogdGhpcy4jY29udHJvbGxlci5zaWduYWwgfSk7XG4gICAgfVxuICAgIHJlbW92ZSgpIHtcbiAgICAgIHRoaXMuI2NvbnRyb2xsZXIuYWJvcnQoXCJbYW55d2lkZ2V0XSBWaWV3IGRlc3Ryb3llZC5cIik7XG4gICAgICBzdXBlci5yZW1vdmUoKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBBbnlNb2RlbCwgQW55VmlldyB9O1xufVxuIiwiaW1wb3J0ICogYXMgYmFzZSBmcm9tIFwiQGp1cHl0ZXItd2lkZ2V0cy9iYXNlXCI7XG5cbmltcG9ydCBjcmVhdGUgZnJvbSBcIi4vd2lkZ2V0LmpzXCI7XG5cbi8qKlxuICogQHR5cGVkZWYgSnVweXRlckxhYlJlZ2lzdHJ5XG4gKiBAcHJvcGVydHkgeyh3aWRnZXQ6IHsgbmFtZTogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcsIGV4cG9ydHM6IGFueSB9KSA9PiB2b2lkfSByZWdpc3RlcldpZGdldFxuICovXG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgaWQ6IFwiYW55d2lkZ2V0OnBsdWdpblwiLFxuICByZXF1aXJlczogWy8qKiBAdHlwZXt1bmtub3dufSAqLyAoYmFzZS5JSnVweXRlcldpZGdldFJlZ2lzdHJ5KV0sXG4gIGFjdGl2YXRlOiAoLyoqIEB0eXBlIHt1bmtub3dufSAqLyBfYXBwLCAvKiogQHR5cGUge0p1cHl0ZXJMYWJSZWdpc3RyeX0gKi8gcmVnaXN0cnkpID0+IHtcbiAgICBsZXQgZXhwb3J0cyA9IGNyZWF0ZShiYXNlKTtcbiAgICByZWdpc3RyeS5yZWdpc3RlcldpZGdldCh7XG4gICAgICBuYW1lOiBcImFueXdpZGdldFwiLFxuICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciBBZGRlZCBieSBidW5kbGVyXG4gICAgICB2ZXJzaW9uOiBnbG9iYWxUaGlzLlZFUlNJT04sXG4gICAgICBleHBvcnRzLFxuICAgIH0pO1xuICB9LFxuICBhdXRvU3RhcnQ6IHRydWUsXG59O1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFxQztBQUNIOztBQUVsQyxjQUFjLGdDQUFnQztBQUM5QyxjQUFjLCtCQUErQjs7QUFFN0M7QUFDQTtBQUNBLGFBQWEsb0JBQW9CO0FBQ2pDOztBQUVBO0FBQ0E7QUFDQSxxQkFBcUI7QUFDckIsaUJBQWlCO0FBQ2pCOztBQUVBO0FBQ0E7QUFDQSxrQkFBa0I7QUFDbEIsbUJBQW1CO0FBQ25COztBQUVBO0FBQ0EsV0FBVyxTQUFTO0FBQ3BCLFdBQVcsUUFBUTtBQUNuQixhQUFhO0FBQ2I7QUFD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