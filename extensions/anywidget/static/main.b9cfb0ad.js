(() => {
"use strict";
var __webpack_modules__ = ({
818() {

;// CONCATENATED MODULE: ./node_modules/.pnpm/@lukeed+uuid@2.0.1/node_modules/@lukeed/uuid/dist/index.mjs
var IDX=256, HEX=[], BUFFER;
while (IDX--) HEX[IDX] = (IDX + 256).toString(16).substring(1);

function v4() {
	var i=0, num, out='';

	if (!BUFFER || ((IDX + 16) > 256)) {
		BUFFER = Array(i=256);
		while (i--) BUFFER[i] = 256 * Math.random() | 0;
		i = IDX = 0;
	}

	for (; i < 16; i++) {
		num = BUFFER[IDX + i];
		if (i==6) out += HEX[num & 15 | 64];
		else if (i==8) out += HEX[num & 63 | 128];
		else out += HEX[num];

		if (i & 1 && i > 1 && i < 11) out += '-';
	}

	IDX++;
	return out;
}

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
  let id = uuid.v4();
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
  let [get, set] = solid.createSignal(model.get(name));
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
    let dispose = solid.createRoot((dispose) => {
      /** @type {AnyModel<State>} */
      // @ts-expect-error - Types don't sufficiently overlap, so we cast here for type-safe access
      let typed_model = model;
      let id = typed_model.get("_anywidget_id");
      let css = observe(typed_model, "_css", { signal: this.#signal });
      let esm = observe(typed_model, "_esm", { signal: this.#signal });
      let [widget_result, set_widget_result] = solid.createSignal(
        /** @type {Result<AnyWidget>} */ ({ status: "pending" }),
      );
      this.#widget_result = widget_result;

      solid.createEffect(
        solid.on(css, () => console.debug(`[anywidget] css hot updated: ${id}`), { defer: true }),
      );
      solid.createEffect(
        solid.on(esm, () => console.debug(`[anywidget] esm hot updated: ${id}`), { defer: true }),
      );
      solid.createEffect(() => {
        return load_css(css(), id);
      });
      solid.createEffect(() => {
        let controller = new AbortController();
        solid.onCleanup(() => controller.abort());
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
    let dispose = solid.createRoot((dispose) => {
      solid.createEffect(() => {
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
        solid.onCleanup(() => controller.abort());
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

;// CONCATENATED MODULE: ./packages/anywidget/src/index.js


// @ts-expect-error -- define is a global provided by the notebook runtime.
define(["@jupyter-widgets/base"], create);


},

});
// The module cache
var __webpack_module_cache__ = {};

// The require function
function __webpack_require__(moduleId) {

// Check if module is in cache
var cachedModule = __webpack_module_cache__[moduleId];
if (cachedModule !== undefined) {
return cachedModule.exports;
}
// Create a new module (and put it into the cache)
var module = (__webpack_module_cache__[moduleId] = {
exports: {}
});
// Execute the module function
__webpack_modules__[moduleId](module, module.exports, __webpack_require__);

// Return the exports of the module
return module.exports;

}

// expose the modules object (__webpack_modules__)
__webpack_require__.m = __webpack_modules__;

// expose the module cache
__webpack_require__.c = __webpack_module_cache__;

// webpack/runtime/has_own_property
(() => {
__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
})();
// webpack/runtime/rspack_version
(() => {
__webpack_require__.rv = () => ("1.7.11")
})();
// webpack/runtime/sharing
(() => {

__webpack_require__.S = {};
__webpack_require__.initializeSharingData = { scopeToSharingDataMapping: {  }, uniqueName: "@anywidget/monorepo" };
var initPromises = {};
var initTokens = {};
__webpack_require__.I = function(name, initScope) {
	if (!initScope) initScope = [];
	// handling circular init calls
	var initToken = initTokens[name];
	if (!initToken) initToken = initTokens[name] = {};
	if (initScope.indexOf(initToken) >= 0) return;
	initScope.push(initToken);
	// only runs once
	if (initPromises[name]) return initPromises[name];
	// creates a new share scope if needed
	if (!__webpack_require__.o(__webpack_require__.S, name))
		__webpack_require__.S[name] = {};
	// runs all init snippets from all modules reachable
	var scope = __webpack_require__.S[name];
	var warn = function (msg) {
		if (typeof console !== "undefined" && console.warn) console.warn(msg);
	};
	var uniqueName = __webpack_require__.initializeSharingData.uniqueName;
	var register = function (name, version, factory, eager) {
		var versions = (scope[name] = scope[name] || {});
		var activeVersion = versions[version];
		if (
			!activeVersion ||
			(!activeVersion.loaded &&
				(!eager != !activeVersion.eager
					? eager
					: uniqueName > activeVersion.from))
		)
			versions[version] = { get: factory, from: uniqueName, eager: !!eager };
	};
	var initExternal = function (id) {
		var handleError = function (err) {
			warn("Initialization of sharing external failed: " + err);
		};
		try {
			var module = __webpack_require__(id);
			if (!module) return;
			var initFn = function (module) {
				return (
					module &&
					module.init &&
					module.init(__webpack_require__.S[name], initScope)
				);
			};
			if (module.then) return promises.push(module.then(initFn, handleError));
			var initResult = initFn(module);
			if (initResult && initResult.then)
				return promises.push(initResult["catch"](handleError));
		} catch (err) {
			handleError(err);
		}
	};
	var promises = [];
	var scopeToSharingDataMapping = __webpack_require__.initializeSharingData.scopeToSharingDataMapping;
	if (scopeToSharingDataMapping[name]) {
		scopeToSharingDataMapping[name].forEach(function (stage) {
			if (typeof stage === "object") register(stage.name, stage.version, stage.factory, stage.eager);
			else initExternal(stage)
		});
	}
	if (!promises.length) return (initPromises[name] = 1);
	return (initPromises[name] = Promise.all(promises).then(function () {
		return (initPromises[name] = 1);
	}));
};


})();
// webpack/runtime/consumes_loading
(() => {

__webpack_require__.consumesLoadingData = { chunkMapping: {}, moduleIdToConsumeDataMapping: {}, initialConsumes: [] };
var splitAndConvert = function(str) {
  return str.split(".").map(function(item) {
    return +item == item ? +item : item;
  });
};
var parseRange = function(str) {
  // see https://docs.npmjs.com/misc/semver#range-grammar for grammar
  var parsePartial = function(str) {
    var match = /^([^-+]+)?(?:-([^+]+))?(?:\+(.+))?$/.exec(str);
    var ver = match[1] ? [0].concat(splitAndConvert(match[1])) : [0];
    if (match[2]) {
      ver.length++;
      ver.push.apply(ver, splitAndConvert(match[2]));
    }

    // remove trailing any matchers
    let last = ver[ver.length - 1];
    while (
      ver.length &&
      (last === undefined || /^[*xX]$/.test(/** @type {string} */ (last)))
    ) {
      ver.pop();
      last = ver[ver.length - 1];
    }

    return ver;
  };
  var toFixed = function(range) {
    if (range.length === 1) {
      // Special case for "*" is "x.x.x" instead of "="
      return [0];
    } else if (range.length === 2) {
      // Special case for "1" is "1.x.x" instead of "=1"
      return [1].concat(range.slice(1));
    } else if (range.length === 3) {
      // Special case for "1.2" is "1.2.x" instead of "=1.2"
      return [2].concat(range.slice(1));
    } else {
      return [range.length].concat(range.slice(1));
    }
  };
  var negate = function(range) {
    return [-range[0] - 1].concat(range.slice(1));
  };
  var parseSimple = function(str) {
    // simple       ::= primitive | partial | tilde | caret
    // primitive    ::= ( '<' | '>' | '>=' | '<=' | '=' | '!' ) ( ' ' ) * partial
    // tilde        ::= '~' ( ' ' ) * partial
    // caret        ::= '^' ( ' ' ) * partial
    const match = /^(\^|~|<=|<|>=|>|=|v|!)/.exec(str);
    const start = match ? match[0] : "";
    const remainder = parsePartial(
      start.length ? str.slice(start.length).trim() : str.trim()
    );
    switch (start) {
      case "^":
        if (remainder.length > 1 && remainder[1] === 0) {
          if (remainder.length > 2 && remainder[2] === 0) {
            return [3].concat(remainder.slice(1));
          }
          return [2].concat(remainder.slice(1));
        }
        return [1].concat(remainder.slice(1));
      case "~":
        return [2].concat(remainder.slice(1));
      case ">=":
        return remainder;
      case "=":
      case "v":
      case "":
        return toFixed(remainder);
      case "<":
        return negate(remainder);
      case ">": {
        // and( >=, not( = ) ) => >=, =, not, and
        const fixed = toFixed(remainder);
        return [, fixed, 0, remainder, 2];
      }
      case "<=":
        // or( <, = ) => <, =, or
        return [, toFixed(remainder), negate(remainder), 1];
      case "!": {
        // not =
        const fixed = toFixed(remainder);
        return [, fixed, 0];
      }
      default:
        throw new Error("Unexpected start value");
    }
  };
  var combine = function(items, fn) {
    if (items.length === 1) return items[0];
    const arr = [];
    for (const item of items.slice().reverse()) {
      if (0 in item) {
        arr.push(item);
      } else {
        arr.push.apply(arr, item.slice(1));
      }
    }
    return [,].concat(arr, items.slice(1).map(() => fn));
  };
  var parseRange = function(str) {
    // range      ::= hyphen | simple ( ' ' ( ' ' ) * simple ) * | ''
    // hyphen     ::= partial ( ' ' ) * ' - ' ( ' ' ) * partial
    const items = str.split(/\s+-\s+/);
    if (items.length === 1) {
			str = str.trim();
			const items = [];
			const r = /[-0-9A-Za-z]\s+/g;
			var start = 0;
			var match;
			while ((match = r.exec(str))) {
				const end = match.index + 1;
				items.push(parseSimple(str.slice(start, end).trim()));
				start = end;
			}
			items.push(parseSimple(str.slice(start).trim()));
      return combine(items, 2);
    }
    const a = parsePartial(items[0]);
    const b = parsePartial(items[1]);
    // >=a <=b => and( >=a, or( <b, =b ) ) => >=a, <b, =b, or, and
    return [, toFixed(b), negate(b), 1, a, 2];
  };
  var parseLogicalOr = function(str) {
    // range-set  ::= range ( logical-or range ) *
    // logical-or ::= ( ' ' ) * '||' ( ' ' ) *
    const items = str.split(/\s*\|\|\s*/).map(parseRange);
    return combine(items, 1);
  };
  return parseLogicalOr(str);
};
var parseVersion = function(str) {
	var match = /^([^-+]+)?(?:-([^+]+))?(?:\+(.+))?$/.exec(str);
	/** @type {(string|number|undefined|[])[]} */
	var ver = match[1] ? splitAndConvert(match[1]) : [];
	if (match[2]) {
		ver.length++;
		ver.push.apply(ver, splitAndConvert(match[2]));
	}
	if (match[3]) {
		ver.push([]);
		ver.push.apply(ver, splitAndConvert(match[3]));
	}
	return ver;
}
var versionLt = function(a, b) {
	a = parseVersion(a);
	b = parseVersion(b);
	var i = 0;
	for (;;) {
		// a       b  EOA     object  undefined  number  string
		// EOA        a == b  a < b   b < a      a < b   a < b
		// object     b < a   (0)     b < a      a < b   a < b
		// undefined  a < b   a < b   (0)        a < b   a < b
		// number     b < a   b < a   b < a      (1)     a < b
		// string     b < a   b < a   b < a      b < a   (1)
		// EOA end of array
		// (0) continue on
		// (1) compare them via "<"

		// Handles first row in table
		if (i >= a.length) return i < b.length && (typeof b[i])[0] != "u";

		var aValue = a[i];
		var aType = (typeof aValue)[0];

		// Handles first column in table
		if (i >= b.length) return aType == "u";

		var bValue = b[i];
		var bType = (typeof bValue)[0];

		if (aType == bType) {
			if (aType != "o" && aType != "u" && aValue != bValue) {
				return aValue < bValue;
			}
			i++;
		} else {
			// Handles remaining cases
			if (aType == "o" && bType == "n") return true;
			return bType == "s" || aType == "u";
		}
	}
}
var rangeToString = function(range) {
	var fixCount = range[0];
	var str = "";
	if (range.length === 1) {
		return "*";
	} else if (fixCount + 0.5) {
		str +=
			fixCount == 0
				? ">="
				: fixCount == -1
				? "<"
				: fixCount == 1
				? "^"
				: fixCount == 2
				? "~"
				: fixCount > 0
				? "="
				: "!=";
		var needDot = 1;
		for (var i = 1; i < range.length; i++) {
			var item = range[i];
			var t = (typeof item)[0];
			needDot--;
			str +=
				t == "u"
					? // undefined: prerelease marker, add an "-"
					  "-"
					: // number or string: add the item, set flag to add an "." between two of them
					  (needDot > 0 ? "." : "") + ((needDot = 2), item);
		}
		return str;
	} else {
		var stack = [];
		for (var i = 1; i < range.length; i++) {
			var item = range[i];
			stack.push(
				item === 0
					? "not(" + pop() + ")"
					: item === 1
					? "(" + pop() + " || " + pop() + ")"
					: item === 2
					? stack.pop() + " " + stack.pop()
					: rangeToString(item)
			);
		}
		return pop();
	}
	function pop() {
		return stack.pop().replace(/^\((.+)\)$/, "$1");
	}
}
var satisfy = function(range, version) {
	if (0 in range) {
		version = parseVersion(version);
		var fixCount = /** @type {number} */ (range[0]);
		// when negated is set it swill set for < instead of >=
		var negated = fixCount < 0;
		if (negated) fixCount = -fixCount - 1;
		for (var i = 0, j = 1, isEqual = true; ; j++, i++) {
			// cspell:word nequal nequ

			// when isEqual = true:
			// range         version: EOA/object  undefined  number    string
			// EOA                    equal       block      big-ver   big-ver
			// undefined              bigger      next       big-ver   big-ver
			// number                 smaller     block      cmp       big-cmp
			// fixed number           smaller     block      cmp-fix   differ
			// string                 smaller     block      differ    cmp
			// fixed string           smaller     block      small-cmp cmp-fix

			// when isEqual = false:
			// range         version: EOA/object  undefined  number    string
			// EOA                    nequal      block      next-ver  next-ver
			// undefined              nequal      block      next-ver  next-ver
			// number                 nequal      block      next      next
			// fixed number           nequal      block      next      next   (this never happens)
			// string                 nequal      block      next      next
			// fixed string           nequal      block      next      next   (this never happens)

			// EOA end of array
			// equal (version is equal range):
			//   when !negated: return true,
			//   when negated: return false
			// bigger (version is bigger as range):
			//   when fixed: return false,
			//   when !negated: return true,
			//   when negated: return false,
			// smaller (version is smaller as range):
			//   when !negated: return false,
			//   when negated: return true
			// nequal (version is not equal range (> resp <)): return true
			// block (version is in different prerelease area): return false
			// differ (version is different from fixed range (string vs. number)): return false
			// next: continues to the next items
			// next-ver: when fixed: return false, continues to the next item only for the version, sets isEqual=false
			// big-ver: when fixed || negated: return false, continues to the next item only for the version, sets isEqual=false
			// next-nequ: continues to the next items, sets isEqual=false
			// cmp (negated === false): version < range => return false, version > range => next-nequ, else => next
			// cmp (negated === true): version > range => return false, version < range => next-nequ, else => next
			// cmp-fix: version == range => next, else => return false
			// big-cmp: when negated => return false, else => next-nequ
			// small-cmp: when negated => next-nequ, else => return false

			var rangeType = j < range.length ? (typeof range[j])[0] : "";

			var versionValue;
			var versionType;

			// Handles first column in both tables (end of version or object)
			if (
				i >= version.length ||
				((versionValue = version[i]),
				(versionType = (typeof versionValue)[0]) == "o")
			) {
				// Handles nequal
				if (!isEqual) return true;
				// Handles bigger
				if (rangeType == "u") return j > fixCount && !negated;
				// Handles equal and smaller: (range === EOA) XOR negated
				return (rangeType == "") != negated; // equal + smaller
			}

			// Handles second column in both tables (version = undefined)
			if (versionType == "u") {
				if (!isEqual || rangeType != "u") {
					return false;
				}
			}

			// switch between first and second table
			else if (isEqual) {
				// Handle diagonal
				if (rangeType == versionType) {
					if (j <= fixCount) {
						// Handles "cmp-fix" cases
						if (versionValue != range[j]) {
							return false;
						}
					} else {
						// Handles "cmp" cases
						if (negated ? versionValue > range[j] : versionValue < range[j]) {
							return false;
						}
						if (versionValue != range[j]) isEqual = false;
					}
				}

				// Handle big-ver
				else if (rangeType != "s" && rangeType != "n") {
					if (negated || j <= fixCount) return false;
					isEqual = false;
					j--;
				}

				// Handle differ, big-cmp and small-cmp
				else if (j <= fixCount || versionType < rangeType != negated) {
					return false;
				} else {
					isEqual = false;
				}
			} else {
				// Handles all "next-ver" cases in the second table
				if (rangeType != "s" && rangeType != "n") {
					isEqual = false;
					j--;
				}

				// next is applied by default
			}
		}
	}
	/** @type {(boolean | number)[]} */
	var stack = [];
	var p = stack.pop.bind(stack);
	for (var i = 1; i < range.length; i++) {
		var item = /** @type {SemVerRange | 0 | 1 | 2} */ (range[i]);
		stack.push(
			item == 1
				? p() | p()
				: item == 2
				? p() & p()
				: item
				? satisfy(item, version)
				: !p()
		);
	}
	return !!p();
}
var ensureExistence = function(scopeName, key) {
	var scope = __webpack_require__.S[scopeName];
	if(!scope || !__webpack_require__.o(scope, key)) throw new Error("Shared module " + key + " doesn't exist in shared scope " + scopeName);
	return scope;
};
var findVersion = function(scope, key) {
	var versions = scope[key];
	var key = Object.keys(versions).reduce(function(a, b) {
		return !a || versionLt(a, b) ? b : a;
	}, 0);
	return key && versions[key]
};
var findSingletonVersionKey = function(scope, key) {
	var versions = scope[key];
	return Object.keys(versions).reduce(function(a, b) {
		return !a || (!versions[a].loaded && versionLt(a, b)) ? b : a;
	}, 0);
};
var getInvalidSingletonVersionMessage = function(scope, key, version, requiredVersion) {
	return "Unsatisfied version " + version + " from " + (version && scope[key][version].from) + " of shared singleton module " + key + " (required " + rangeToString(requiredVersion) + ")"
};
var getSingleton = function(scope, scopeName, key, requiredVersion) {
	var version = findSingletonVersionKey(scope, key);
	return get(scope[key][version]);
};
var getSingletonVersion = function(scope, scopeName, key, requiredVersion) {
	var version = findSingletonVersionKey(scope, key);
	if (!satisfy(requiredVersion, version)) warn(getInvalidSingletonVersionMessage(scope, key, version, requiredVersion));
	return get(scope[key][version]);
};
var getStrictSingletonVersion = function(scope, scopeName, key, requiredVersion) {
	var version = findSingletonVersionKey(scope, key);
	if (!satisfy(requiredVersion, version)) throw new Error(getInvalidSingletonVersionMessage(scope, key, version, requiredVersion));
	return get(scope[key][version]);
};
var findValidVersion = function(scope, key, requiredVersion) {
	var versions = scope[key];
	var key = Object.keys(versions).reduce(function(a, b) {
		if (!satisfy(requiredVersion, b)) return a;
		return !a || versionLt(a, b) ? b : a;
	}, 0);
	return key && versions[key]
};
var getInvalidVersionMessage = function(scope, scopeName, key, requiredVersion) {
	var versions = scope[key];
	return "No satisfying version (" + rangeToString(requiredVersion) + ") of shared module " + key + " found in shared scope " + scopeName + ".\n" +
		"Available versions: " + Object.keys(versions).map(function(key) {
		return key + " from " + versions[key].from;
	}).join(", ");
};
var getValidVersion = function(scope, scopeName, key, requiredVersion) {
	var entry = findValidVersion(scope, key, requiredVersion);
	if(entry) return get(entry);
	throw new Error(getInvalidVersionMessage(scope, scopeName, key, requiredVersion));
};
var warn = function(msg) {
	if (typeof console !== "undefined" && console.warn) console.warn(msg);
};
var warnInvalidVersion = function(scope, scopeName, key, requiredVersion) {
	warn(getInvalidVersionMessage(scope, scopeName, key, requiredVersion));
};
var get = function(entry) {
	entry.loaded = 1;
	return entry.get()
};
var init = function(fn) { return function(scopeName, a, b, c) {
	var promise = __webpack_require__.I(scopeName);
	if (promise && promise.then) return promise.then(fn.bind(fn, scopeName, __webpack_require__.S[scopeName], a, b, c));
	return fn(scopeName, __webpack_require__.S[scopeName], a, b, c);
}; };

var load = /*#__PURE__*/ init(function(scopeName, scope, key) {
	ensureExistence(scopeName, key);
	return get(findVersion(scope, key));
});
var loadFallback = /*#__PURE__*/ init(function(scopeName, scope, key, fallback) {
	return scope && __webpack_require__.o(scope, key) ? get(findVersion(scope, key)) : fallback();
});
var loadVersionCheck = /*#__PURE__*/ init(function(scopeName, scope, key, version) {
	ensureExistence(scopeName, key);
	return get(findValidVersion(scope, key, version) || warnInvalidVersion(scope, scopeName, key, version) || findVersion(scope, key));
});
var loadSingleton = /*#__PURE__*/ init(function(scopeName, scope, key) {
	ensureExistence(scopeName, key);
	return getSingleton(scope, scopeName, key);
});
var loadSingletonVersionCheck = /*#__PURE__*/ init(function(scopeName, scope, key, version) {
	ensureExistence(scopeName, key);
	return getSingletonVersion(scope, scopeName, key, version);
});
var loadStrictVersionCheck = /*#__PURE__*/ init(function(scopeName, scope, key, version) {
	ensureExistence(scopeName, key);
	return getValidVersion(scope, scopeName, key, version);
});
var loadStrictSingletonVersionCheck = /*#__PURE__*/ init(function(scopeName, scope, key, version) {
	ensureExistence(scopeName, key);
	return getStrictSingletonVersion(scope, scopeName, key, version);
});
var loadVersionCheckFallback = /*#__PURE__*/ init(function(scopeName, scope, key, version, fallback) {
	if(!scope || !__webpack_require__.o(scope, key)) return fallback();
	return get(findValidVersion(scope, key, version) || warnInvalidVersion(scope, scopeName, key, version) || findVersion(scope, key));
});
var loadSingletonFallback = /*#__PURE__*/ init(function(scopeName, scope, key, fallback) {
	if(!scope || !__webpack_require__.o(scope, key)) return fallback();
	return getSingleton(scope, scopeName, key);
});
var loadSingletonVersionCheckFallback = /*#__PURE__*/ init(function(scopeName, scope, key, version, fallback) {
	if(!scope || !__webpack_require__.o(scope, key)) return fallback();
	return getSingletonVersion(scope, scopeName, key, version);
});
var loadStrictVersionCheckFallback = /*#__PURE__*/ init(function(scopeName, scope, key, version, fallback) {
	var entry = scope && __webpack_require__.o(scope, key) && findValidVersion(scope, key, version);
	return entry ? get(entry) : fallback();
});
var loadStrictSingletonVersionCheckFallback = /*#__PURE__*/ init(function(scopeName, scope, key, version, fallback) {
	if(!scope || !__webpack_require__.o(scope, key)) return fallback();
	return getStrictSingletonVersion(scope, scopeName, key, version);
});
var resolveHandler = function(data) {
	var strict = false
	var singleton = false
	var versionCheck = false
	var fallback = false
	var args = [data.shareScope, data.shareKey];
	if (data.requiredVersion) {
		if (data.strictVersion) strict = true;
		if (data.singleton) singleton = true;
		args.push(parseRange(data.requiredVersion));
		versionCheck = true
	} else if (data.singleton) singleton = true;
	if (data.fallback) {
		fallback = true;
		args.push(data.fallback);
	}
	if (strict && singleton && versionCheck && fallback) return function() { return loadStrictSingletonVersionCheckFallback.apply(null, args); }
	if (strict && versionCheck && fallback) return function() { return loadStrictVersionCheckFallback.apply(null, args); }
	if (singleton && versionCheck && fallback) return function() { return loadSingletonVersionCheckFallback.apply(null, args); }
	if (strict && singleton && versionCheck) return function() { return loadStrictSingletonVersionCheck.apply(null, args); }
	if (singleton && fallback) return function() { return loadSingletonFallback.apply(null, args); }
	if (versionCheck && fallback) return function() { return loadVersionCheckFallback.apply(null, args); }
	if (strict && versionCheck) return function() { return loadStrictVersionCheck.apply(null, args); }
	if (singleton && versionCheck) return function() { return loadSingletonVersionCheck.apply(null, args); }
	if (singleton) return function() { return loadSingleton.apply(null, args); }
	if (versionCheck) return function() { return loadVersionCheck.apply(null, args); }
	if (fallback) return function() { return loadFallback.apply(null, args); }
	return function() { return load.apply(null, args); }
};
var installedModules = {};

})();
// webpack/runtime/rspack_unique_id
(() => {
__webpack_require__.ruid = "bundler=rspack@1.7.11";
})();
// module cache are used so entry inlining is disabled
// startup
// Load entry module and return exports
var __webpack_exports__ = __webpack_require__(818);
})()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5iMWE3ZjRmMS5qcyIsInNvdXJjZXMiOlsid2VicGFjazovL0Bhbnl3aWRnZXQvbW9ub3JlcG8vLi9ub2RlX21vZHVsZXMvLnBucG0vQGx1a2VlZCt1dWlkQDIuMC4xL25vZGVfbW9kdWxlcy9AbHVrZWVkL3V1aWQvZGlzdC9pbmRleC5tanMiLCJ3ZWJwYWNrOi8vQGFueXdpZGdldC9tb25vcmVwby8uL3BhY2thZ2VzL2FueXdpZGdldC9zcmMvd2lkZ2V0LmpzIiwid2VicGFjazovL0Bhbnl3aWRnZXQvbW9ub3JlcG8vLi9wYWNrYWdlcy9hbnl3aWRnZXQvc3JjL2luZGV4LmpzIiwid2VicGFjazovL0Bhbnl3aWRnZXQvbW9ub3JlcG8vd2VicGFjay9ydW50aW1lL2hhc19vd25fcHJvcGVydHkiLCJ3ZWJwYWNrOi8vQGFueXdpZGdldC9tb25vcmVwby93ZWJwYWNrL3J1bnRpbWUvcnNwYWNrX3ZlcnNpb24iLCJ3ZWJwYWNrOi8vQGFueXdpZGdldC9tb25vcmVwby93ZWJwYWNrL3J1bnRpbWUvc2hhcmluZyIsIndlYnBhY2s6Ly9AYW55d2lkZ2V0L21vbm9yZXBvL3dlYnBhY2svcnVudGltZS9jb25zdW1lc19sb2FkaW5nIiwid2VicGFjazovL0Bhbnl3aWRnZXQvbW9ub3JlcG8vd2VicGFjay9ydW50aW1lL3JzcGFja191bmlxdWVfaWQiXSwic291cmNlc0NvbnRlbnQiOlsidmFyIElEWD0yNTYsIEhFWD1bXSwgQlVGRkVSO1xud2hpbGUgKElEWC0tKSBIRVhbSURYXSA9IChJRFggKyAyNTYpLnRvU3RyaW5nKDE2KS5zdWJzdHJpbmcoMSk7XG5cbmV4cG9ydCBmdW5jdGlvbiB2NCgpIHtcblx0dmFyIGk9MCwgbnVtLCBvdXQ9Jyc7XG5cblx0aWYgKCFCVUZGRVIgfHwgKChJRFggKyAxNikgPiAyNTYpKSB7XG5cdFx0QlVGRkVSID0gQXJyYXkoaT0yNTYpO1xuXHRcdHdoaWxlIChpLS0pIEJVRkZFUltpXSA9IDI1NiAqIE1hdGgucmFuZG9tKCkgfCAwO1xuXHRcdGkgPSBJRFggPSAwO1xuXHR9XG5cblx0Zm9yICg7IGkgPCAxNjsgaSsrKSB7XG5cdFx0bnVtID0gQlVGRkVSW0lEWCArIGldO1xuXHRcdGlmIChpPT02KSBvdXQgKz0gSEVYW251bSAmIDE1IHwgNjRdO1xuXHRcdGVsc2UgaWYgKGk9PTgpIG91dCArPSBIRVhbbnVtICYgNjMgfCAxMjhdO1xuXHRcdGVsc2Ugb3V0ICs9IEhFWFtudW1dO1xuXG5cdFx0aWYgKGkgJiAxICYmIGkgPiAxICYmIGkgPCAxMSkgb3V0ICs9ICctJztcblx0fVxuXG5cdElEWCsrO1xuXHRyZXR1cm4gb3V0O1xufVxuIiwiaW1wb3J0ICogYXMgdXVpZCBmcm9tIFwiQGx1a2VlZC91dWlkXCI7XG5pbXBvcnQgKiBhcyBzb2xpZCBmcm9tIFwic29saWQtanNcIjtcblxuLyoqIEBpbXBvcnQgeyBET01XaWRnZXRNb2RlbCwgRE9NV2lkZ2V0VmlldyB9IGZyb20gXCJAanVweXRlci13aWRnZXRzL2Jhc2VcIiAqL1xuLyoqIEBpbXBvcnQgeyBJbml0aWFsaXplLCBSZW5kZXIsIEFueU1vZGVsIH0gZnJvbSBcIkBhbnl3aWRnZXQvdHlwZXNcIiAqL1xuXG4vKipcbiAqIEB0ZW1wbGF0ZSBUXG4gKiBAdHlwZWRlZiB7VCB8IFByb21pc2VMaWtlPFQ+fSBBd2FpdGFibGVcbiAqL1xuXG4vKipcbiAqIEB0eXBlZGVmIEFueVdpZGdldFxuICogQHByb3AgaW5pdGlhbGl6ZSB7SW5pdGlhbGl6ZX1cbiAqIEBwcm9wIHJlbmRlciB7UmVuZGVyfVxuICovXG5cbi8qKlxuICogIEB0eXBlZGVmIEFueVdpZGdldE1vZHVsZVxuICogIEBwcm9wIHJlbmRlciB7UmVuZGVyPX1cbiAqICBAcHJvcCBkZWZhdWx0IHtBbnlXaWRnZXQgfCAoKCkgPT4gQW55V2lkZ2V0IHwgUHJvbWlzZTxBbnlXaWRnZXQ+KT19XG4gKi9cblxuLyoqXG4gKiBAcGFyYW0ge3Vua25vd259IGNvbmRpdGlvblxuICogQHBhcmFtIHtzdHJpbmd9IG1lc3NhZ2VcbiAqIEByZXR1cm5zIHthc3NlcnRzIGNvbmRpdGlvbn1cbiAqL1xuZnVuY3Rpb24gYXNzZXJ0KGNvbmRpdGlvbiwgbWVzc2FnZSkge1xuICBpZiAoIWNvbmRpdGlvbikgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBzdHJcbiAqIEByZXR1cm5zIHtzdHIgaXMgXCJodHRwczovLyR7c3RyaW5nfVwiIHwgXCJodHRwOi8vJHtzdHJpbmd9XCJ9XG4gKi9cbmZ1bmN0aW9uIGlzX2hyZWYoc3RyKSB7XG4gIHJldHVybiBzdHIuc3RhcnRzV2l0aChcImh0dHA6Ly9cIikgfHwgc3RyLnN0YXJ0c1dpdGgoXCJodHRwczovL1wiKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge3N0cmluZ30gaHJlZlxuICogQHBhcmFtIHtzdHJpbmd9IGFueXdpZGdldF9pZFxuICogQHJldHVybnMge1Byb21pc2U8dm9pZD59XG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGxvYWRfY3NzX2hyZWYoaHJlZiwgYW55d2lkZ2V0X2lkKSB7XG4gIC8qKiBAdHlwZSB7SFRNTExpbmtFbGVtZW50IHwgbnVsbH0gKi9cbiAgbGV0IHByZXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBsaW5rW2lkPScke2FueXdpZGdldF9pZH0nXWApO1xuXG4gIC8vIEFkYXB0ZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vdml0ZWpzL3ZpdGUvYmxvYi9kNTllMWFjYzJlZmMwMzA3NDg4MzY0ZTlmMmZhZDUyOGVjNTdmMjA0L3BhY2thZ2VzL3ZpdGUvc3JjL2NsaWVudC9jbGllbnQudHMjTDE4NS1MMjAxXG4gIC8vIFN3YXBzIG91dCBvbGQgc3R5bGVzIHdpdGggbmV3LCBidXQgYXZvaWRzIGZsYXNoIG9mIHVuc3R5bGVkIGNvbnRlbnQuXG4gIC8vIE5vIG5lZWQgdG8gYXdhaXQgdGhlIGxvYWQgc2luY2Ugd2UgYWxyZWFkeSBoYXZlIHN0eWxlcyBhcHBsaWVkLlxuICBpZiAocHJldikge1xuICAgIC8qKiBAdHlwZSB7SFRNTExpbmtFbGVtZW50fSAqL1xuICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgLSB3ZSBrbm93IGl0J3MgYW4gSFRNTExpbmtFbGVtZW50IGJlY2F1c2UgcHJldiBpcyBhbiBIVE1MTGlua0VsZW1lbnRcbiAgICBsZXQgbmV3TGluayA9IHByZXYuY2xvbmVOb2RlKCk7XG4gICAgbmV3TGluay5ocmVmID0gaHJlZjtcbiAgICBuZXdMaW5rLmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkXCIsICgpID0+IHByZXY/LnJlbW92ZSgpKTtcbiAgICBuZXdMaW5rLmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCAoKSA9PiBwcmV2Py5yZW1vdmUoKSk7XG4gICAgcHJldi5hZnRlcihuZXdMaW5rKTtcbiAgICByZXR1cm47XG4gIH1cblxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBsZXQgbGluayA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpbmtcIiksIHtcbiAgICAgIHJlbDogXCJzdHlsZXNoZWV0XCIsXG4gICAgICBocmVmLFxuICAgICAgb25sb2FkOiByZXNvbHZlLFxuICAgIH0pO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQobGluayk7XG4gIH0pO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBjc3NfdGV4dFxuICogQHBhcmFtIHtzdHJpbmd9IGFueXdpZGdldF9pZFxuICogQHJldHVybnMge3ZvaWR9XG4gKi9cbmZ1bmN0aW9uIGxvYWRfY3NzX3RleHQoY3NzX3RleHQsIGFueXdpZGdldF9pZCkge1xuICAvKiogQHR5cGUge0hUTUxTdHlsZUVsZW1lbnQgfCBudWxsfSAqL1xuICBsZXQgcHJldiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYHN0eWxlW2lkPScke2FueXdpZGdldF9pZH0nXWApO1xuICBpZiAocHJldikge1xuICAgIC8vIHJlcGxhY2UgaW5zdGVhZCBvZiBjcmVhdGluZyBhIG5ldyBET00gbm9kZVxuICAgIHByZXYudGV4dENvbnRlbnQgPSBjc3NfdGV4dDtcbiAgICByZXR1cm47XG4gIH1cbiAgbGV0IHN0eWxlID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3R5bGVcIiksIHtcbiAgICBpZDogYW55d2lkZ2V0X2lkLFxuICAgIHR5cGU6IFwidGV4dC9jc3NcIixcbiAgfSk7XG4gIHN0eWxlLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGNzc190ZXh0KSk7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nIHwgdW5kZWZpbmVkfSBjc3NcbiAqIEBwYXJhbSB7c3RyaW5nfSBhbnl3aWRnZXRfaWRcbiAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fVxuICovXG5hc3luYyBmdW5jdGlvbiBsb2FkX2Nzcyhjc3MsIGFueXdpZGdldF9pZCkge1xuICBpZiAoIWNzcyB8fCAhYW55d2lkZ2V0X2lkKSByZXR1cm47XG4gIGlmIChpc19ocmVmKGNzcykpIHJldHVybiBsb2FkX2Nzc19ocmVmKGNzcywgYW55d2lkZ2V0X2lkKTtcbiAgcmV0dXJuIGxvYWRfY3NzX3RleHQoY3NzLCBhbnl3aWRnZXRfaWQpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBlc21cbiAqIEByZXR1cm5zIHtQcm9taXNlPEFueVdpZGdldE1vZHVsZT59XG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGxvYWRfZXNtKGVzbSkge1xuICBpZiAoaXNfaHJlZihlc20pKSB7XG4gICAgcmV0dXJuIGF3YWl0IGltcG9ydCgvKiB3ZWJwYWNrSWdub3JlOiB0cnVlICovIC8qIEB2aXRlLWlnbm9yZSAqLyBlc20pO1xuICB9XG4gIGxldCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFtlc21dLCB7IHR5cGU6IFwidGV4dC9qYXZhc2NyaXB0XCIgfSkpO1xuICBsZXQgbW9kID0gYXdhaXQgaW1wb3J0KC8qIHdlYnBhY2tJZ25vcmU6IHRydWUgKi8gLyogQHZpdGUtaWdub3JlICovIHVybCk7XG4gIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgcmV0dXJuIG1vZDtcbn1cblxuLyoqIEBwYXJhbSB7c3RyaW5nfSBhbnl3aWRnZXRfaWQgKi9cbmZ1bmN0aW9uIHdhcm5fcmVuZGVyX2RlcHJlY2F0aW9uKGFueXdpZGdldF9pZCkge1xuICBjb25zb2xlLndhcm4oYFxcXG5bYW55d2lkZ2V0XSBEZXByZWNhdGlvbiBXYXJuaW5nIGZvciAke2FueXdpZGdldF9pZH06IERpcmVjdCBleHBvcnQgb2YgYSAncmVuZGVyJyB3aWxsIGxpa2VseSBiZSBkZXByZWNhdGVkIGluIHRoZSBmdXR1cmUuIFRvIG1pZ3JhdGUgLi4uXG5cblJlbW92ZSB0aGUgJ2V4cG9ydCcga2V5d29yZCBmcm9tICdyZW5kZXInXG4tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyKHsgbW9kZWwsIGVsIH0pIHsgLi4uIH1cbl5eXl5eXlxuXG5DcmVhdGUgYSBkZWZhdWx0IGV4cG9ydCB0aGF0IHJldHVybnMgYW4gb2JqZWN0IHdpdGggJ3JlbmRlcidcbi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiByZW5kZXIoeyBtb2RlbCwgZWwgfSkgeyAuLi4gfVxuICAgICAgICAgXl5eXl5eXG5leHBvcnQgZGVmYXVsdCB7IHJlbmRlciB9XG4gICAgICAgICAgICAgICAgIF5eXl5eXlxuXG5QaW4gdG8gYW55d2lkZ2V0Pj0wLjkuMCBpbiB5b3VyIHB5cHJvamVjdC50b21sXG4tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmRlcGVuZGVuY2llcyA9IFtcImFueXdpZGdldD49MC45LjBcIl1cblxuVG8gbGVhcm4gbW9yZSwgcGxlYXNlIHNlZTogaHR0cHM6Ly9naXRodWIuY29tL21hbnp0L2FueXdpZGdldC9wdWxsLzM5NS5cbmApO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBlc21cbiAqIEBwYXJhbSB7c3RyaW5nfSBhbnl3aWRnZXRfaWRcbiAqIEByZXR1cm5zIHtQcm9taXNlPEFueVdpZGdldD59XG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGxvYWRfd2lkZ2V0KGVzbSwgYW55d2lkZ2V0X2lkKSB7XG4gIGxldCBtb2QgPSBhd2FpdCBsb2FkX2VzbShlc20pO1xuICBpZiAobW9kLnJlbmRlcikge1xuICAgIHdhcm5fcmVuZGVyX2RlcHJlY2F0aW9uKGFueXdpZGdldF9pZCk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGFzeW5jIGluaXRpYWxpemUoKSB7fSxcbiAgICAgIHJlbmRlcjogbW9kLnJlbmRlcixcbiAgICB9O1xuICB9XG4gIGFzc2VydChtb2QuZGVmYXVsdCwgYFthbnl3aWRnZXRdIG1vZHVsZSBtdXN0IGV4cG9ydCBhIGRlZmF1bHQgZnVuY3Rpb24gb3Igb2JqZWN0LmApO1xuICBsZXQgd2lkZ2V0ID0gdHlwZW9mIG1vZC5kZWZhdWx0ID09PSBcImZ1bmN0aW9uXCIgPyBhd2FpdCBtb2QuZGVmYXVsdCgpIDogbW9kLmRlZmF1bHQ7XG4gIHJldHVybiB3aWRnZXQ7XG59XG5cbi8qKlxuICogVGhpcyBpcyBhIHRyaWNrIHNvIHRoYXQgd2UgY2FuIGNsZWFudXAgZXZlbnQgbGlzdGVuZXJzIGFkZGVkXG4gKiBieSB0aGUgdXNlci1kZWZpbmVkIGZ1bmN0aW9uLlxuICovXG5sZXQgSU5JVElBTElaRV9NQVJLRVIgPSBTeW1ib2woXCJhbnl3aWRnZXQuaW5pdGlhbGl6ZVwiKTtcblxuLyoqXG4gKiBAcGFyYW0ge0RPTVdpZGdldE1vZGVsfSBtb2RlbFxuICogQHBhcmFtIHt1bmtub3dufSBjb250ZXh0XG4gKiBAcmV0dXJuIHtpbXBvcnQoXCJAYW55d2lkZ2V0L3R5cGVzXCIpLkFueU1vZGVsfVxuICpcbiAqIFBydW5lcyB0aGUgdmlldyBkb3duIHRvIHRoZSBtaW5pbXVtIGNvbnRleHQgbmVjZXNzYXJ5LlxuICpcbiAqIENhbGxzIHRvIGBtb2RlbC5nZXRgIGFuZCBgbW9kZWwuc2V0YCBhdXRvbWF0aWNhbGx5IGFkZCB0aGVcbiAqIGBjb250ZXh0YCwgc28gd2UgY2FuIGdyYWNlZnVsbHkgdW5zdWJzY3JpYmUgZnJvbSBldmVudHNcbiAqIGFkZGVkIGJ5IHVzZXItZGVmaW5lZCBob29rcy5cbiAqL1xuZnVuY3Rpb24gbW9kZWxfcHJveHkobW9kZWwsIGNvbnRleHQpIHtcbiAgcmV0dXJuIHtcbiAgICBnZXQ6IG1vZGVsLmdldC5iaW5kKG1vZGVsKSxcbiAgICBzZXQ6IG1vZGVsLnNldC5iaW5kKG1vZGVsKSxcbiAgICBzYXZlX2NoYW5nZXM6IG1vZGVsLnNhdmVfY2hhbmdlcy5iaW5kKG1vZGVsKSxcbiAgICBzZW5kOiBtb2RlbC5zZW5kLmJpbmQobW9kZWwpLFxuICAgIG9uKG5hbWUsIGNhbGxiYWNrKSB7XG4gICAgICBtb2RlbC5vbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCk7XG4gICAgfSxcbiAgICBvZmYobmFtZSwgY2FsbGJhY2spIHtcbiAgICAgIG1vZGVsLm9mZihuYW1lLCBjYWxsYmFjaywgY29udGV4dCk7XG4gICAgfSxcbiAgICAvLyBAdHMtZXhwZWN0LWVycm9yIC0gdGhlIHdpZGdldF9tYW5hZ2VyIHR5cGUgaXMgd2lkZXIgdGhhbiB3aGF0XG4gICAgLy8gd2Ugd2FudCB0byBleHBvc2UgdG8gZGV2ZWxvcGVycy5cbiAgICAvLyBJbiBhIGZ1dHVyZSB2ZXJzaW9uLCB3ZSB3aWxsIGV4cG9zZSBhIG1vcmUgbGltaXRlZCBBUEkgYnV0XG4gICAgLy8gdGhhdCBjYW4gd2FpdCBmb3IgYSBtaW5vciB2ZXJzaW9uIGJ1bXAuXG4gICAgd2lkZ2V0X21hbmFnZXI6IG1vZGVsLndpZGdldF9tYW5hZ2VyLFxuICB9O1xufVxuXG4vKipcbiAqIEBwYXJhbSB7dm9pZCB8ICgoKSA9PiBBd2FpdGFibGU8dm9pZD4pfSBmblxuICogQHBhcmFtIHtzdHJpbmd9IGtpbmRcbiAqL1xuYXN5bmMgZnVuY3Rpb24gc2FmZV9jbGVhbnVwKGZuLCBraW5kKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IGZuPy4oKSlcbiAgICAuY2F0Y2goKGUpID0+IGNvbnNvbGUud2FybihgW2FueXdpZGdldF0gZXJyb3IgY2xlYW5pbmcgdXAgJHtraW5kfS5gLCBlKSk7XG59XG5cbi8qKlxuICogQHRlbXBsYXRlIFRcbiAqIEB0eXBlZGVmIFJlYWR5XG4gKiBAcHJvcGVydHkge1wicmVhZHlcIn0gc3RhdHVzXG4gKiBAcHJvcGVydHkge1R9IGRhdGFcbiAqL1xuXG4vKipcbiAqIEB0eXBlZGVmIFBlbmRpbmdcbiAqIEBwcm9wZXJ0eSB7XCJwZW5kaW5nXCJ9IHN0YXR1c1xuICovXG5cbi8qKlxuICogQHR5cGVkZWYgRXJyb3JlZFxuICogQHByb3BlcnR5IHtcImVycm9yXCJ9IHN0YXR1c1xuICogQHByb3BlcnR5IHt1bmtub3dufSBlcnJvclxuICovXG5cbi8qKlxuICogQHRlbXBsYXRlIFRcbiAqIEB0eXBlZGVmIHtQZW5kaW5nIHwgUmVhZHk8VD4gfCBFcnJvcmVkfSBSZXN1bHRcbiAqL1xuXG4vKipcbiAqIENsZWFucyB1cCB0aGUgc3RhY2sgdHJhY2UgYXQgYW55d2lkZ2V0IGJvdW5kYXJ5LlxuICogWW91IGNhbiBmdWxseSBpbnNwZWN0IHRoZSBlbnRpcmUgc3RhY2sgdHJhY2UgaW4gdGhlIGNvbnNvbGUgaW50ZXJhY3RpdmVseSxcbiAqIGJ1dCB0aGUgaW5pdGlhbCBlcnJvciBtZXNzYWdlIGlzIGNsZWFuZWQgdXAgdG8gYmUgbW9yZSB1c2VyLWZyaWVuZGx5LlxuICpcbiAqIEBwYXJhbSB7dW5rbm93bn0gc291cmNlXG4gKi9cbmZ1bmN0aW9uIHRocm93X2FueXdpZGdldF9lcnJvcihzb3VyY2UpIHtcbiAgaWYgKCEoc291cmNlIGluc3RhbmNlb2YgRXJyb3IpKSB7XG4gICAgLy8gRG9uJ3Qga25vdyB3aGF0IHRvIGRvIHdpdGggdGhpcy5cbiAgICB0aHJvdyBzb3VyY2U7XG4gIH1cbiAgbGV0IGxpbmVzID0gc291cmNlLnN0YWNrPy5zcGxpdChcIlxcblwiKSA/PyBbXTtcbiAgbGV0IGFueXdpZGdldF9pbmRleCA9IGxpbmVzLmZpbmRJbmRleCgobGluZSkgPT4gbGluZS5pbmNsdWRlcyhcImFueXdpZGdldFwiKSk7XG4gIGxldCBjbGVhbl9zdGFjayA9IGFueXdpZGdldF9pbmRleCA9PT0gLTEgPyBsaW5lcyA6IGxpbmVzLnNsaWNlKDAsIGFueXdpZGdldF9pbmRleCArIDEpO1xuICBzb3VyY2Uuc3RhY2sgPSBjbGVhbl9zdGFjay5qb2luKFwiXFxuXCIpO1xuICBjb25zb2xlLmVycm9yKHNvdXJjZSk7XG4gIHRocm93IHNvdXJjZTtcbn1cblxuLyoqXG4gKiBAdHlwZWRlZiBJbnZva2VPcHRpb25zXG4gKiBAcHJvcCB7RGF0YVZpZXdbXX0gW2J1ZmZlcnNdXG4gKiBAcHJvcCB7QWJvcnRTaWduYWx9IFtzaWduYWxdXG4gKi9cblxuLyoqXG4gKiBAdGVtcGxhdGUgVFxuICogQHBhcmFtIHtpbXBvcnQoXCJAYW55d2lkZ2V0L3R5cGVzXCIpLkFueU1vZGVsfSBtb2RlbFxuICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAqIEBwYXJhbSB7YW55fSBbbXNnXVxuICogQHBhcmFtIHtJbnZva2VPcHRpb25zfSBbb3B0aW9uc11cbiAqIEByZXR1cm4ge1Byb21pc2U8W1QsIERhdGFWaWV3W11dPn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGludm9rZShtb2RlbCwgbmFtZSwgbXNnLCBvcHRpb25zID0ge30pIHtcbiAgLy8gY3J5cHRvLnJhbmRvbVVVSUQoKSBpcyBub3QgYXZhaWxhYmxlIGluIG5vbi1zZWN1cmUgY29udGV4dHMgKGkuZS4sIGh0dHA6Ly8pXG4gIC8vIHNvIHdlIHVzZSBzaW1wbGUgKG5vbi1zZWN1cmUpIHBvbHlmaWxsLlxuICBsZXQgaWQgPSB1dWlkLnY0KCk7XG4gIGxldCBzaWduYWwgPSBvcHRpb25zLnNpZ25hbCA/PyBBYm9ydFNpZ25hbC50aW1lb3V0KDMwMDApO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgaWYgKHNpZ25hbC5hYm9ydGVkKSB7XG4gICAgICByZWplY3Qoc2lnbmFsLnJlYXNvbik7XG4gICAgfVxuICAgIHNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgKCkgPT4ge1xuICAgICAgbW9kZWwub2ZmKFwibXNnOmN1c3RvbVwiLCBoYW5kbGVyKTtcbiAgICAgIHJlamVjdChzaWduYWwucmVhc29uKTtcbiAgICB9KTtcblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7eyBpZDogc3RyaW5nLCBraW5kOiBcImFueXdpZGdldC1jb21tYW5kLXJlc3BvbnNlXCIsIHJlc3BvbnNlOiBUIH19IG1zZ1xuICAgICAqIEBwYXJhbSB7RGF0YVZpZXdbXX0gYnVmZmVyc1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIGhhbmRsZXIobXNnLCBidWZmZXJzKSB7XG4gICAgICBpZiAoIShtc2cuaWQgPT09IGlkKSkgcmV0dXJuO1xuICAgICAgcmVzb2x2ZShbbXNnLnJlc3BvbnNlLCBidWZmZXJzXSk7XG4gICAgICBtb2RlbC5vZmYoXCJtc2c6Y3VzdG9tXCIsIGhhbmRsZXIpO1xuICAgIH1cbiAgICBtb2RlbC5vbihcIm1zZzpjdXN0b21cIiwgaGFuZGxlcik7XG4gICAgbW9kZWwuc2VuZCh7IGlkLCBraW5kOiBcImFueXdpZGdldC1jb21tYW5kXCIsIG5hbWUsIG1zZyB9LCB1bmRlZmluZWQsIG9wdGlvbnMuYnVmZmVycyA/PyBbXSk7XG4gIH0pO1xufVxuXG4vKipcbiAqIFBvbHlmaWxsIGZvciB7QGxpbmsgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvUHJvbWlzZS93aXRoUmVzb2x2ZXJzIFByb21pc2Uud2l0aFJlc29sdmVyc31cbiAqXG4gKiBUcmV2b3IoMjAyNS0wMy0xNCk6IFNob3VsZCBiZSBhYmxlIHRvIHJlbW92ZSBvbmNlIG1vcmUgc3RhYmxlIGFjcm9zcyBicm93c2Vycy5cbiAqXG4gKiBAdGVtcGxhdGUgVFxuICogQHJldHVybnMge1Byb21pc2VXaXRoUmVzb2x2ZXJzPFQ+fVxuICovXG5mdW5jdGlvbiBwcm9taXNlX3dpdGhfcmVzb2x2ZXJzKCkge1xuICBsZXQgcmVzb2x2ZTtcbiAgbGV0IHJlamVjdDtcbiAgbGV0IHByb21pc2UgPSBuZXcgUHJvbWlzZSgocmVzLCByZWopID0+IHtcbiAgICByZXNvbHZlID0gcmVzO1xuICAgIHJlamVjdCA9IHJlajtcbiAgfSk7XG4gIC8vIEB0cy1leHBlY3QtZXJyb3IgLSBXZSBrbm93IHRoZXNlIHR5cGVzIGFyZSBva1xuICByZXR1cm4geyBwcm9taXNlLCByZXNvbHZlLCByZWplY3QgfTtcbn1cblxuLyoqXG4gKiBAdGVtcGxhdGUge1JlY29yZDxzdHJpbmcsIHVua25vd24+fSBUXG4gKiBAdGVtcGxhdGUge2tleW9mIFQgJiBzdHJpbmd9IEtcbiAqIEBwYXJhbSB7QW55TW9kZWw8VD59IG1vZGVsXG4gKiBAcGFyYW0ge0t9IG5hbWVcbiAqIEBwYXJhbSB7eyBzaWduYWw/OiBBYm9ydFNpZ25hbH19IG9wdGlvbnNcbiAqIEByZXR1cm5zIHtzb2xpZC5BY2Nlc3NvcjxUW0tdPn1cbiAqL1xuZnVuY3Rpb24gb2JzZXJ2ZShtb2RlbCwgbmFtZSwgeyBzaWduYWwgfSkge1xuICBsZXQgW2dldCwgc2V0XSA9IHNvbGlkLmNyZWF0ZVNpZ25hbChtb2RlbC5nZXQobmFtZSkpO1xuICBsZXQgdXBkYXRlID0gKCkgPT4gc2V0KCgpID0+IG1vZGVsLmdldChuYW1lKSk7XG4gIG1vZGVsLm9uKGBjaGFuZ2U6JHtuYW1lfWAsIHVwZGF0ZSk7XG4gIHNpZ25hbD8uYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsICgpID0+IHtcbiAgICBtb2RlbC5vZmYoYGNoYW5nZToke25hbWV9YCwgdXBkYXRlKTtcbiAgfSk7XG4gIHJldHVybiBnZXQ7XG59XG5cbi8qKlxuICogQHR5cGVkZWYgU3RhdGVcbiAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBfZXNtXG4gKiBAcHJvcGVydHkge3N0cmluZ30gX2FueXdpZGdldF9pZFxuICogQHByb3BlcnR5IHtzdHJpbmcgfCB1bmRlZmluZWR9IF9jc3NcbiAqL1xuXG5jbGFzcyBSdW50aW1lIHtcbiAgLyoqIEB0eXBlIHtzb2xpZC5BY2Nlc3NvcjxSZXN1bHQ8QW55V2lkZ2V0Pj59ICovXG4gIC8vIEB0cy1leHBlY3QtZXJyb3IgLSBTZXQgc3luY2hyb25vdXNseSBpbiBjb25zdHJ1Y3Rvci5cbiAgI3dpZGdldF9yZXN1bHQ7XG4gIC8qKiBAdHlwZSB7QWJvcnRTaWduYWx9ICovXG4gICNzaWduYWw7XG4gIC8qKiBAdHlwZSB7UHJvbWlzZTx2b2lkPn0gKi9cbiAgcmVhZHk7XG5cbiAgLyoqXG4gICAqIEBwYXJhbSB7RE9NV2lkZ2V0TW9kZWx9IG1vZGVsXG4gICAqIEBwYXJhbSB7eyBzaWduYWw6IEFib3J0U2lnbmFsIH19IG9wdGlvbnNcbiAgICovXG4gIGNvbnN0cnVjdG9yKG1vZGVsLCBvcHRpb25zKSB7XG4gICAgLyoqIEB0eXBlIHtQcm9taXNlV2l0aFJlc29sdmVyczx2b2lkPn0gKi9cbiAgICBsZXQgcmVzb2x2ZXJzID0gcHJvbWlzZV93aXRoX3Jlc29sdmVycygpO1xuICAgIHRoaXMucmVhZHkgPSByZXNvbHZlcnMucHJvbWlzZTtcbiAgICB0aGlzLiNzaWduYWwgPSBvcHRpb25zLnNpZ25hbDtcbiAgICB0aGlzLiNzaWduYWwudGhyb3dJZkFib3J0ZWQoKTtcbiAgICB0aGlzLiNzaWduYWwuYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsICgpID0+IGRpc3Bvc2UoKSk7XG4gICAgQWJvcnRTaWduYWwudGltZW91dCgyMDAwKS5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgKCkgPT4ge1xuICAgICAgcmVzb2x2ZXJzLnJlamVjdChuZXcgRXJyb3IoXCJbYW55d2lkZ2V0XSBGYWlsZWQgdG8gaW5pdGlhbGl6ZSBtb2RlbC5cIikpO1xuICAgIH0pO1xuICAgIGxldCBkaXNwb3NlID0gc29saWQuY3JlYXRlUm9vdCgoZGlzcG9zZSkgPT4ge1xuICAgICAgLyoqIEB0eXBlIHtBbnlNb2RlbDxTdGF0ZT59ICovXG4gICAgICAvLyBAdHMtZXhwZWN0LWVycm9yIC0gVHlwZXMgZG9uJ3Qgc3VmZmljaWVudGx5IG92ZXJsYXAsIHNvIHdlIGNhc3QgaGVyZSBmb3IgdHlwZS1zYWZlIGFjY2Vzc1xuICAgICAgbGV0IHR5cGVkX21vZGVsID0gbW9kZWw7XG4gICAgICBsZXQgaWQgPSB0eXBlZF9tb2RlbC5nZXQoXCJfYW55d2lkZ2V0X2lkXCIpO1xuICAgICAgbGV0IGNzcyA9IG9ic2VydmUodHlwZWRfbW9kZWwsIFwiX2Nzc1wiLCB7IHNpZ25hbDogdGhpcy4jc2lnbmFsIH0pO1xuICAgICAgbGV0IGVzbSA9IG9ic2VydmUodHlwZWRfbW9kZWwsIFwiX2VzbVwiLCB7IHNpZ25hbDogdGhpcy4jc2lnbmFsIH0pO1xuICAgICAgbGV0IFt3aWRnZXRfcmVzdWx0LCBzZXRfd2lkZ2V0X3Jlc3VsdF0gPSBzb2xpZC5jcmVhdGVTaWduYWwoXG4gICAgICAgIC8qKiBAdHlwZSB7UmVzdWx0PEFueVdpZGdldD59ICovICh7IHN0YXR1czogXCJwZW5kaW5nXCIgfSksXG4gICAgICApO1xuICAgICAgdGhpcy4jd2lkZ2V0X3Jlc3VsdCA9IHdpZGdldF9yZXN1bHQ7XG5cbiAgICAgIHNvbGlkLmNyZWF0ZUVmZmVjdChcbiAgICAgICAgc29saWQub24oY3NzLCAoKSA9PiBjb25zb2xlLmRlYnVnKGBbYW55d2lkZ2V0XSBjc3MgaG90IHVwZGF0ZWQ6ICR7aWR9YCksIHsgZGVmZXI6IHRydWUgfSksXG4gICAgICApO1xuICAgICAgc29saWQuY3JlYXRlRWZmZWN0KFxuICAgICAgICBzb2xpZC5vbihlc20sICgpID0+IGNvbnNvbGUuZGVidWcoYFthbnl3aWRnZXRdIGVzbSBob3QgdXBkYXRlZDogJHtpZH1gKSwgeyBkZWZlcjogdHJ1ZSB9KSxcbiAgICAgICk7XG4gICAgICBzb2xpZC5jcmVhdGVFZmZlY3QoKCkgPT4ge1xuICAgICAgICByZXR1cm4gbG9hZF9jc3MoY3NzKCksIGlkKTtcbiAgICAgIH0pO1xuICAgICAgc29saWQuY3JlYXRlRWZmZWN0KCgpID0+IHtcbiAgICAgICAgbGV0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgICAgIHNvbGlkLm9uQ2xlYW51cCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCkpO1xuICAgICAgICBtb2RlbC5vZmYobnVsbCwgbnVsbCwgSU5JVElBTElaRV9NQVJLRVIpO1xuICAgICAgICBsb2FkX3dpZGdldChlc20oKSwgaWQpXG4gICAgICAgICAgLnRoZW4oYXN5bmMgKHdpZGdldCkgPT4ge1xuICAgICAgICAgICAgaWYgKGNvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IGNsZWFudXAgPSBhd2FpdCB3aWRnZXQuaW5pdGlhbGl6ZT8uKHtcbiAgICAgICAgICAgICAgbW9kZWw6IG1vZGVsX3Byb3h5KG1vZGVsLCBJTklUSUFMSVpFX01BUktFUiksXG4gICAgICAgICAgICAgIGV4cGVyaW1lbnRhbDoge1xuICAgICAgICAgICAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgLSBiaW5kIGlzbid0IHdvcmtpbmdcbiAgICAgICAgICAgICAgICBpbnZva2U6IGludm9rZS5iaW5kKG51bGwsIG1vZGVsKSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGNvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHNhZmVfY2xlYW51cChjbGVhbnVwLCBcImVzbSB1cGRhdGVcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250cm9sbGVyLnNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgKCkgPT4gc2FmZV9jbGVhbnVwKGNsZWFudXAsIFwiZXNtIHVwZGF0ZVwiKSk7XG4gICAgICAgICAgICBzZXRfd2lkZ2V0X3Jlc3VsdCh7IHN0YXR1czogXCJyZWFkeVwiLCBkYXRhOiB3aWRnZXQgfSk7XG4gICAgICAgICAgICByZXNvbHZlcnMucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKChlcnJvcikgPT4gc2V0X3dpZGdldF9yZXN1bHQoeyBzdGF0dXM6IFwiZXJyb3JcIiwgZXJyb3IgfSkpO1xuICAgICAgfSk7XG5cbiAgICAgIHJldHVybiBkaXNwb3NlO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEBwYXJhbSB7RE9NV2lkZ2V0Vmlld30gdmlld1xuICAgKiBAcGFyYW0ge3sgc2lnbmFsOiBBYm9ydFNpZ25hbCB9fSBvcHRpb25zXG4gICAqIEByZXR1cm5zIHtQcm9taXNlPHZvaWQ+fVxuICAgKi9cbiAgYXN5bmMgY3JlYXRlX3ZpZXcodmlldywgb3B0aW9ucykge1xuICAgIGxldCBtb2RlbCA9IHZpZXcubW9kZWw7XG4gICAgbGV0IHNpZ25hbCA9IEFib3J0U2lnbmFsLmFueShbdGhpcy4jc2lnbmFsLCBvcHRpb25zLnNpZ25hbF0pOyAvLyBlaXRoZXIgbW9kZWwgb3IgdmlldyBkZXN0cm95ZWRcbiAgICBzaWduYWwudGhyb3dJZkFib3J0ZWQoKTtcbiAgICBzaWduYWwuYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsICgpID0+IGRpc3Bvc2UoKSk7XG4gICAgbGV0IGRpc3Bvc2UgPSBzb2xpZC5jcmVhdGVSb290KChkaXNwb3NlKSA9PiB7XG4gICAgICBzb2xpZC5jcmVhdGVFZmZlY3QoKCkgPT4ge1xuICAgICAgICAvLyBDbGVhciBhbGwgcHJldmlvdXMgZXZlbnQgbGlzdGVuZXJzIGZyb20gdGhpcyBob29rLlxuICAgICAgICBtb2RlbC5vZmYobnVsbCwgbnVsbCwgdmlldyk7XG4gICAgICAgIHZpZXcuJGVsLmVtcHR5KCk7XG4gICAgICAgIGxldCByZXN1bHQgPSB0aGlzLiN3aWRnZXRfcmVzdWx0KCk7XG4gICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSBcInBlbmRpbmdcIikge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gXCJlcnJvclwiKSB7XG4gICAgICAgICAgdGhyb3dfYW55d2lkZ2V0X2Vycm9yKHJlc3VsdC5lcnJvcik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGxldCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgICAgICBzb2xpZC5vbkNsZWFudXAoKCkgPT4gY29udHJvbGxlci5hYm9ydCgpKTtcbiAgICAgICAgUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICAudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBsZXQgY2xlYW51cCA9IGF3YWl0IHJlc3VsdC5kYXRhLnJlbmRlcj8uKHtcbiAgICAgICAgICAgICAgbW9kZWw6IG1vZGVsX3Byb3h5KG1vZGVsLCB2aWV3KSxcbiAgICAgICAgICAgICAgZWw6IHZpZXcuZWwsXG4gICAgICAgICAgICAgIGV4cGVyaW1lbnRhbDoge1xuICAgICAgICAgICAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgLSBiaW5kIGlzbid0IHdvcmtpbmdcbiAgICAgICAgICAgICAgICBpbnZva2U6IGludm9rZS5iaW5kKG51bGwsIG1vZGVsKSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGNvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHNhZmVfY2xlYW51cChjbGVhbnVwLCBcImRpc3Bvc2UgdmlldyAtIGFscmVhZHkgYWJvcnRlZFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRyb2xsZXIuc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCAoKSA9PlxuICAgICAgICAgICAgICBzYWZlX2NsZWFudXAoY2xlYW51cCwgXCJkaXNwb3NlIHZpZXcgLSBhYm9ydGVkXCIpLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHRocm93X2FueXdpZGdldF9lcnJvcihlcnJvcikpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gKCkgPT4gZGlzcG9zZSgpO1xuICAgIH0pO1xuICB9XG59XG5cbi8vIEB0cy1leHBlY3QtZXJyb3IgLSBpbmplY3RlZCBieSBidW5kbGVyXG5sZXQgdmVyc2lvbiA9IGdsb2JhbFRoaXMuVkVSU0lPTjtcblxuLyoqXG4gKiBAcGFyYW0ge3tcbiAqICAgRE9NV2lkZ2V0TW9kZWw6IHR5cGVvZiBpbXBvcnQoXCJAanVweXRlci13aWRnZXRzL2Jhc2VcIikuRE9NV2lkZ2V0TW9kZWwsXG4gKiAgIERPTVdpZGdldFZpZXc6IHR5cGVvZiBpbXBvcnQoXCJAanVweXRlci13aWRnZXRzL2Jhc2VcIikuRE9NV2lkZ2V0Vmlld1xuICogfX0gb3B0aW9uc1xuICogQHJldHVybnMge3sgQW55TW9kZWw6IHR5cGVvZiBpbXBvcnQoXCJAanVweXRlci13aWRnZXRzL2Jhc2VcIikuRE9NV2lkZ2V0TW9kZWwsIEFueVZpZXc6IHR5cGVvZiBpbXBvcnQoXCJAanVweXRlci13aWRnZXRzL2Jhc2VcIikuRE9NV2lkZ2V0VmlldyB9fVxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoeyBET01XaWRnZXRNb2RlbCwgRE9NV2lkZ2V0VmlldyB9KSB7XG4gIC8qKiBAdHlwZSB7V2Vha01hcDxBbnlNb2RlbCwgUnVudGltZT59ICovXG4gIGxldCBSVU5USU1FUyA9IG5ldyBXZWFrTWFwKCk7XG5cbiAgY2xhc3MgQW55TW9kZWwgZXh0ZW5kcyBET01XaWRnZXRNb2RlbCB7XG4gICAgc3RhdGljIG1vZGVsX25hbWUgPSBcIkFueU1vZGVsXCI7XG4gICAgc3RhdGljIG1vZGVsX21vZHVsZSA9IFwiYW55d2lkZ2V0XCI7XG4gICAgc3RhdGljIG1vZGVsX21vZHVsZV92ZXJzaW9uID0gdmVyc2lvbjtcblxuICAgIHN0YXRpYyB2aWV3X25hbWUgPSBcIkFueVZpZXdcIjtcbiAgICBzdGF0aWMgdmlld19tb2R1bGUgPSBcImFueXdpZGdldFwiO1xuICAgIHN0YXRpYyB2aWV3X21vZHVsZV92ZXJzaW9uID0gdmVyc2lvbjtcblxuICAgIC8qKiBAcGFyYW0ge1BhcmFtZXRlcnM8SW5zdGFuY2VUeXBlPHR5cGVvZiBET01XaWRnZXRNb2RlbD5bXCJpbml0aWFsaXplXCJdPn0gYXJncyAqL1xuICAgIGluaXRpYWxpemUoLi4uYXJncykge1xuICAgICAgc3VwZXIuaW5pdGlhbGl6ZSguLi5hcmdzKTtcbiAgICAgIGxldCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuICAgICAgdGhpcy5vbmNlKFwiZGVzdHJveVwiLCAoKSA9PiB7XG4gICAgICAgIGNvbnRyb2xsZXIuYWJvcnQoXCJbYW55d2lkZ2V0XSBSdW50aW1lIGRlc3Ryb3llZC5cIik7XG4gICAgICAgIFJVTlRJTUVTLmRlbGV0ZSh0aGlzKTtcbiAgICAgIH0pO1xuICAgICAgUlVOVElNRVMuc2V0KHRoaXMsIG5ldyBSdW50aW1lKHRoaXMsIHsgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCB9KSk7XG4gICAgfVxuXG4gICAgLyoqIEBwYXJhbSB7UGFyYW1ldGVyczxJbnN0YW5jZVR5cGU8dHlwZW9mIERPTVdpZGdldE1vZGVsPltcIl9oYW5kbGVfY29tbV9tc2dcIl0+fSBtc2cgKi9cbiAgICBhc3luYyBfaGFuZGxlX2NvbW1fbXNnKC4uLm1zZykge1xuICAgICAgbGV0IHJ1bnRpbWUgPSBSVU5USU1FUy5nZXQodGhpcyk7XG4gICAgICBhd2FpdCBydW50aW1lPy5yZWFkeTtcbiAgICAgIHJldHVybiBzdXBlci5faGFuZGxlX2NvbW1fbXNnKC4uLm1zZyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtSZWNvcmQ8c3RyaW5nLCBhbnk+fSBzdGF0ZVxuICAgICAqXG4gICAgICogV2Ugb3ZlcnJpZGUgdG8gc3VwcG9ydCBiaW5hcnkgdHJhaWxldHMgYmVjYXVzZSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KCkpXG4gICAgICogZG9lcyBub3QgcHJvcGVybHkgY2xvbmUgYmluYXJ5IGRhdGEgKGl0IGp1c3QgcmV0dXJucyBhbiBlbXB0eSBvYmplY3QpLlxuICAgICAqXG4gICAgICogaHR0cHM6Ly9naXRodWIuY29tL2p1cHl0ZXItd2lkZ2V0cy9pcHl3aWRnZXRzL2Jsb2IvNDcwNThhMzczZDJjMmIzYWNmMTAxNjc3YjI3NDVlMTRiNzZkZDc0Yi9wYWNrYWdlcy9iYXNlL3NyYy93aWRnZXQudHMjTDU2Mi1MNTgzXG4gICAgICovXG4gICAgc2VyaWFsaXplKHN0YXRlKSB7XG4gICAgICAvLyBveGxpbnQtZGlzYWJsZS1uZXh0LWxpbmUgdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW5zYWZlLXR5cGUtYXNzZXJ0aW9uIC0tIGFjY2Vzc2luZyBzdGF0aWMgYC5zZXJpYWxpemVyc2Agb24gYHRoaXMuY29uc3RydWN0b3JgXG4gICAgICBsZXQgc2VyaWFsaXplcnMgPSAvKiogQHR5cGUge3R5cGVvZiBET01XaWRnZXRNb2RlbH0gKi8gKHRoaXMuY29uc3RydWN0b3IpLnNlcmlhbGl6ZXJzIHx8IHt9O1xuICAgICAgZm9yIChsZXQgayBvZiBPYmplY3Qua2V5cyhzdGF0ZSkpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsZXQgc2VyaWFsaXplID0gc2VyaWFsaXplcnNba10/LnNlcmlhbGl6ZTtcbiAgICAgICAgICBpZiAoc2VyaWFsaXplKSB7XG4gICAgICAgICAgICBzdGF0ZVtrXSA9IHNlcmlhbGl6ZShzdGF0ZVtrXSwgdGhpcyk7XG4gICAgICAgICAgfSBlbHNlIGlmIChrID09PSBcImxheW91dFwiIHx8IGsgPT09IFwic3R5bGVcIikge1xuICAgICAgICAgICAgLy8gVGhlc2Uga2V5cyBjb21lIGZyb20gaXB5d2lkZ2V0cywgcmVseSBvbiBKU09OLnN0cmluZ2lmeSB0cmljay5cbiAgICAgICAgICAgIHN0YXRlW2tdID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShzdGF0ZVtrXSkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGF0ZVtrXSA9IHN0cnVjdHVyZWRDbG9uZShzdGF0ZVtrXSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2Ygc3RhdGVba10/LnRvSlNPTiA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICBzdGF0ZVtrXSA9IHN0YXRlW2tdLnRvSlNPTigpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBzZXJpYWxpemluZyB3aWRnZXQgc3RhdGUgYXR0cmlidXRlOiBcIiwgayk7XG4gICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH1cbiAgfVxuXG4gIGNsYXNzIEFueVZpZXcgZXh0ZW5kcyBET01XaWRnZXRWaWV3IHtcbiAgICAjY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBhc3luYyByZW5kZXIoKSB7XG4gICAgICBsZXQgcnVudGltZSA9IFJVTlRJTUVTLmdldCh0aGlzLm1vZGVsKTtcbiAgICAgIGFzc2VydChydW50aW1lLCBcIlthbnl3aWRnZXRdIFJ1bnRpbWUgbm90IGZvdW5kLlwiKTtcbiAgICAgIGF3YWl0IHJ1bnRpbWUuY3JlYXRlX3ZpZXcodGhpcywgeyBzaWduYWw6IHRoaXMuI2NvbnRyb2xsZXIuc2lnbmFsIH0pO1xuICAgIH1cbiAgICByZW1vdmUoKSB7XG4gICAgICB0aGlzLiNjb250cm9sbGVyLmFib3J0KFwiW2FueXdpZGdldF0gVmlldyBkZXN0cm95ZWQuXCIpO1xuICAgICAgc3VwZXIucmVtb3ZlKCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgQW55TW9kZWwsIEFueVZpZXcgfTtcbn1cbiIsImltcG9ydCBjcmVhdGUgZnJvbSBcIi4vd2lkZ2V0LmpzXCI7XG5cbi8vIEB0cy1leHBlY3QtZXJyb3IgLS0gZGVmaW5lIGlzIGEgZ2xvYmFsIHByb3ZpZGVkIGJ5IHRoZSBub3RlYm9vayBydW50aW1lLlxuZGVmaW5lKFtcIkBqdXB5dGVyLXdpZGdldHMvYmFzZVwiXSwgY3JlYXRlKTtcbiIsIl9fd2VicGFja19yZXF1aXJlX18ubyA9IChvYmosIHByb3ApID0+IChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKSkiLCJfX3dlYnBhY2tfcmVxdWlyZV9fLnJ2ID0gKCkgPT4gKFwiMS43LjExXCIpIiwiXG5fX3dlYnBhY2tfcmVxdWlyZV9fLlMgPSB7fTtcbl9fd2VicGFja19yZXF1aXJlX18uaW5pdGlhbGl6ZVNoYXJpbmdEYXRhID0geyBzY29wZVRvU2hhcmluZ0RhdGFNYXBwaW5nOiB7ICB9LCB1bmlxdWVOYW1lOiBcIkBhbnl3aWRnZXQvbW9ub3JlcG9cIiB9O1xudmFyIGluaXRQcm9taXNlcyA9IHt9O1xudmFyIGluaXRUb2tlbnMgPSB7fTtcbl9fd2VicGFja19yZXF1aXJlX18uSSA9IGZ1bmN0aW9uKG5hbWUsIGluaXRTY29wZSkge1xuXHRpZiAoIWluaXRTY29wZSkgaW5pdFNjb3BlID0gW107XG5cdC8vIGhhbmRsaW5nIGNpcmN1bGFyIGluaXQgY2FsbHNcblx0dmFyIGluaXRUb2tlbiA9IGluaXRUb2tlbnNbbmFtZV07XG5cdGlmICghaW5pdFRva2VuKSBpbml0VG9rZW4gPSBpbml0VG9rZW5zW25hbWVdID0ge307XG5cdGlmIChpbml0U2NvcGUuaW5kZXhPZihpbml0VG9rZW4pID49IDApIHJldHVybjtcblx0aW5pdFNjb3BlLnB1c2goaW5pdFRva2VuKTtcblx0Ly8gb25seSBydW5zIG9uY2Vcblx0aWYgKGluaXRQcm9taXNlc1tuYW1lXSkgcmV0dXJuIGluaXRQcm9taXNlc1tuYW1lXTtcblx0Ly8gY3JlYXRlcyBhIG5ldyBzaGFyZSBzY29wZSBpZiBuZWVkZWRcblx0aWYgKCFfX3dlYnBhY2tfcmVxdWlyZV9fLm8oX193ZWJwYWNrX3JlcXVpcmVfXy5TLCBuYW1lKSlcblx0XHRfX3dlYnBhY2tfcmVxdWlyZV9fLlNbbmFtZV0gPSB7fTtcblx0Ly8gcnVucyBhbGwgaW5pdCBzbmlwcGV0cyBmcm9tIGFsbCBtb2R1bGVzIHJlYWNoYWJsZVxuXHR2YXIgc2NvcGUgPSBfX3dlYnBhY2tfcmVxdWlyZV9fLlNbbmFtZV07XG5cdHZhciB3YXJuID0gZnVuY3Rpb24gKG1zZykge1xuXHRcdGlmICh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiBjb25zb2xlLndhcm4pIGNvbnNvbGUud2Fybihtc2cpO1xuXHR9O1xuXHR2YXIgdW5pcXVlTmFtZSA9IF9fd2VicGFja19yZXF1aXJlX18uaW5pdGlhbGl6ZVNoYXJpbmdEYXRhLnVuaXF1ZU5hbWU7XG5cdHZhciByZWdpc3RlciA9IGZ1bmN0aW9uIChuYW1lLCB2ZXJzaW9uLCBmYWN0b3J5LCBlYWdlcikge1xuXHRcdHZhciB2ZXJzaW9ucyA9IChzY29wZVtuYW1lXSA9IHNjb3BlW25hbWVdIHx8IHt9KTtcblx0XHR2YXIgYWN0aXZlVmVyc2lvbiA9IHZlcnNpb25zW3ZlcnNpb25dO1xuXHRcdGlmIChcblx0XHRcdCFhY3RpdmVWZXJzaW9uIHx8XG5cdFx0XHQoIWFjdGl2ZVZlcnNpb24ubG9hZGVkICYmXG5cdFx0XHRcdCghZWFnZXIgIT0gIWFjdGl2ZVZlcnNpb24uZWFnZXJcblx0XHRcdFx0XHQ/IGVhZ2VyXG5cdFx0XHRcdFx0OiB1bmlxdWVOYW1lID4gYWN0aXZlVmVyc2lvbi5mcm9tKSlcblx0XHQpXG5cdFx0XHR2ZXJzaW9uc1t2ZXJzaW9uXSA9IHsgZ2V0OiBmYWN0b3J5LCBmcm9tOiB1bmlxdWVOYW1lLCBlYWdlcjogISFlYWdlciB9O1xuXHR9O1xuXHR2YXIgaW5pdEV4dGVybmFsID0gZnVuY3Rpb24gKGlkKSB7XG5cdFx0dmFyIGhhbmRsZUVycm9yID0gZnVuY3Rpb24gKGVycikge1xuXHRcdFx0d2FybihcIkluaXRpYWxpemF0aW9uIG9mIHNoYXJpbmcgZXh0ZXJuYWwgZmFpbGVkOiBcIiArIGVycik7XG5cdFx0fTtcblx0XHR0cnkge1xuXHRcdFx0dmFyIG1vZHVsZSA9IF9fd2VicGFja19yZXF1aXJlX18oaWQpO1xuXHRcdFx0aWYgKCFtb2R1bGUpIHJldHVybjtcblx0XHRcdHZhciBpbml0Rm4gPSBmdW5jdGlvbiAobW9kdWxlKSB7XG5cdFx0XHRcdHJldHVybiAoXG5cdFx0XHRcdFx0bW9kdWxlICYmXG5cdFx0XHRcdFx0bW9kdWxlLmluaXQgJiZcblx0XHRcdFx0XHRtb2R1bGUuaW5pdChfX3dlYnBhY2tfcmVxdWlyZV9fLlNbbmFtZV0sIGluaXRTY29wZSlcblx0XHRcdFx0KTtcblx0XHRcdH07XG5cdFx0XHRpZiAobW9kdWxlLnRoZW4pIHJldHVybiBwcm9taXNlcy5wdXNoKG1vZHVsZS50aGVuKGluaXRGbiwgaGFuZGxlRXJyb3IpKTtcblx0XHRcdHZhciBpbml0UmVzdWx0ID0gaW5pdEZuKG1vZHVsZSk7XG5cdFx0XHRpZiAoaW5pdFJlc3VsdCAmJiBpbml0UmVzdWx0LnRoZW4pXG5cdFx0XHRcdHJldHVybiBwcm9taXNlcy5wdXNoKGluaXRSZXN1bHRbXCJjYXRjaFwiXShoYW5kbGVFcnJvcikpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aGFuZGxlRXJyb3IoZXJyKTtcblx0XHR9XG5cdH07XG5cdHZhciBwcm9taXNlcyA9IFtdO1xuXHR2YXIgc2NvcGVUb1NoYXJpbmdEYXRhTWFwcGluZyA9IF9fd2VicGFja19yZXF1aXJlX18uaW5pdGlhbGl6ZVNoYXJpbmdEYXRhLnNjb3BlVG9TaGFyaW5nRGF0YU1hcHBpbmc7XG5cdGlmIChzY29wZVRvU2hhcmluZ0RhdGFNYXBwaW5nW25hbWVdKSB7XG5cdFx0c2NvcGVUb1NoYXJpbmdEYXRhTWFwcGluZ1tuYW1lXS5mb3JFYWNoKGZ1bmN0aW9uIChzdGFnZSkge1xuXHRcdFx0aWYgKHR5cGVvZiBzdGFnZSA9PT0gXCJvYmplY3RcIikgcmVnaXN0ZXIoc3RhZ2UubmFtZSwgc3RhZ2UudmVyc2lvbiwgc3RhZ2UuZmFjdG9yeSwgc3RhZ2UuZWFnZXIpO1xuXHRcdFx0ZWxzZSBpbml0RXh0ZXJuYWwoc3RhZ2UpXG5cdFx0fSk7XG5cdH1cblx0aWYgKCFwcm9taXNlcy5sZW5ndGgpIHJldHVybiAoaW5pdFByb21pc2VzW25hbWVdID0gMSk7XG5cdHJldHVybiAoaW5pdFByb21pc2VzW25hbWVdID0gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiAoaW5pdFByb21pc2VzW25hbWVdID0gMSk7XG5cdH0pKTtcbn07XG5cbiIsIlxuX193ZWJwYWNrX3JlcXVpcmVfXy5jb25zdW1lc0xvYWRpbmdEYXRhID0geyBjaHVua01hcHBpbmc6IHt9LCBtb2R1bGVJZFRvQ29uc3VtZURhdGFNYXBwaW5nOiB7fSwgaW5pdGlhbENvbnN1bWVzOiBbXSB9O1xudmFyIHNwbGl0QW5kQ29udmVydCA9IGZ1bmN0aW9uKHN0cikge1xuICByZXR1cm4gc3RyLnNwbGl0KFwiLlwiKS5tYXAoZnVuY3Rpb24oaXRlbSkge1xuICAgIHJldHVybiAraXRlbSA9PSBpdGVtID8gK2l0ZW0gOiBpdGVtO1xuICB9KTtcbn07XG52YXIgcGFyc2VSYW5nZSA9IGZ1bmN0aW9uKHN0cikge1xuICAvLyBzZWUgaHR0cHM6Ly9kb2NzLm5wbWpzLmNvbS9taXNjL3NlbXZlciNyYW5nZS1ncmFtbWFyIGZvciBncmFtbWFyXG4gIHZhciBwYXJzZVBhcnRpYWwgPSBmdW5jdGlvbihzdHIpIHtcbiAgICB2YXIgbWF0Y2ggPSAvXihbXi0rXSspPyg/Oi0oW14rXSspKT8oPzpcXCsoLispKT8kLy5leGVjKHN0cik7XG4gICAgdmFyIHZlciA9IG1hdGNoWzFdID8gWzBdLmNvbmNhdChzcGxpdEFuZENvbnZlcnQobWF0Y2hbMV0pKSA6IFswXTtcbiAgICBpZiAobWF0Y2hbMl0pIHtcbiAgICAgIHZlci5sZW5ndGgrKztcbiAgICAgIHZlci5wdXNoLmFwcGx5KHZlciwgc3BsaXRBbmRDb252ZXJ0KG1hdGNoWzJdKSk7XG4gICAgfVxuXG4gICAgLy8gcmVtb3ZlIHRyYWlsaW5nIGFueSBtYXRjaGVyc1xuICAgIGxldCBsYXN0ID0gdmVyW3Zlci5sZW5ndGggLSAxXTtcbiAgICB3aGlsZSAoXG4gICAgICB2ZXIubGVuZ3RoICYmXG4gICAgICAobGFzdCA9PT0gdW5kZWZpbmVkIHx8IC9eWyp4WF0kLy50ZXN0KC8qKiBAdHlwZSB7c3RyaW5nfSAqLyAobGFzdCkpKVxuICAgICkge1xuICAgICAgdmVyLnBvcCgpO1xuICAgICAgbGFzdCA9IHZlclt2ZXIubGVuZ3RoIC0gMV07XG4gICAgfVxuXG4gICAgcmV0dXJuIHZlcjtcbiAgfTtcbiAgdmFyIHRvRml4ZWQgPSBmdW5jdGlvbihyYW5nZSkge1xuICAgIGlmIChyYW5nZS5sZW5ndGggPT09IDEpIHtcbiAgICAgIC8vIFNwZWNpYWwgY2FzZSBmb3IgXCIqXCIgaXMgXCJ4LngueFwiIGluc3RlYWQgb2YgXCI9XCJcbiAgICAgIHJldHVybiBbMF07XG4gICAgfSBlbHNlIGlmIChyYW5nZS5sZW5ndGggPT09IDIpIHtcbiAgICAgIC8vIFNwZWNpYWwgY2FzZSBmb3IgXCIxXCIgaXMgXCIxLngueFwiIGluc3RlYWQgb2YgXCI9MVwiXG4gICAgICByZXR1cm4gWzFdLmNvbmNhdChyYW5nZS5zbGljZSgxKSk7XG4gICAgfSBlbHNlIGlmIChyYW5nZS5sZW5ndGggPT09IDMpIHtcbiAgICAgIC8vIFNwZWNpYWwgY2FzZSBmb3IgXCIxLjJcIiBpcyBcIjEuMi54XCIgaW5zdGVhZCBvZiBcIj0xLjJcIlxuICAgICAgcmV0dXJuIFsyXS5jb25jYXQocmFuZ2Uuc2xpY2UoMSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gW3JhbmdlLmxlbmd0aF0uY29uY2F0KHJhbmdlLnNsaWNlKDEpKTtcbiAgICB9XG4gIH07XG4gIHZhciBuZWdhdGUgPSBmdW5jdGlvbihyYW5nZSkge1xuICAgIHJldHVybiBbLXJhbmdlWzBdIC0gMV0uY29uY2F0KHJhbmdlLnNsaWNlKDEpKTtcbiAgfTtcbiAgdmFyIHBhcnNlU2ltcGxlID0gZnVuY3Rpb24oc3RyKSB7XG4gICAgLy8gc2ltcGxlICAgICAgIDo6PSBwcmltaXRpdmUgfCBwYXJ0aWFsIHwgdGlsZGUgfCBjYXJldFxuICAgIC8vIHByaW1pdGl2ZSAgICA6Oj0gKCAnPCcgfCAnPicgfCAnPj0nIHwgJzw9JyB8ICc9JyB8ICchJyApICggJyAnICkgKiBwYXJ0aWFsXG4gICAgLy8gdGlsZGUgICAgICAgIDo6PSAnficgKCAnICcgKSAqIHBhcnRpYWxcbiAgICAvLyBjYXJldCAgICAgICAgOjo9ICdeJyAoICcgJyApICogcGFydGlhbFxuICAgIGNvbnN0IG1hdGNoID0gL14oXFxefH58PD18PHw+PXw+fD18dnwhKS8uZXhlYyhzdHIpO1xuICAgIGNvbnN0IHN0YXJ0ID0gbWF0Y2ggPyBtYXRjaFswXSA6IFwiXCI7XG4gICAgY29uc3QgcmVtYWluZGVyID0gcGFyc2VQYXJ0aWFsKFxuICAgICAgc3RhcnQubGVuZ3RoID8gc3RyLnNsaWNlKHN0YXJ0Lmxlbmd0aCkudHJpbSgpIDogc3RyLnRyaW0oKVxuICAgICk7XG4gICAgc3dpdGNoIChzdGFydCkge1xuICAgICAgY2FzZSBcIl5cIjpcbiAgICAgICAgaWYgKHJlbWFpbmRlci5sZW5ndGggPiAxICYmIHJlbWFpbmRlclsxXSA9PT0gMCkge1xuICAgICAgICAgIGlmIChyZW1haW5kZXIubGVuZ3RoID4gMiAmJiByZW1haW5kZXJbMl0gPT09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBbM10uY29uY2F0KHJlbWFpbmRlci5zbGljZSgxKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBbMl0uY29uY2F0KHJlbWFpbmRlci5zbGljZSgxKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFsxXS5jb25jYXQocmVtYWluZGVyLnNsaWNlKDEpKTtcbiAgICAgIGNhc2UgXCJ+XCI6XG4gICAgICAgIHJldHVybiBbMl0uY29uY2F0KHJlbWFpbmRlci5zbGljZSgxKSk7XG4gICAgICBjYXNlIFwiPj1cIjpcbiAgICAgICAgcmV0dXJuIHJlbWFpbmRlcjtcbiAgICAgIGNhc2UgXCI9XCI6XG4gICAgICBjYXNlIFwidlwiOlxuICAgICAgY2FzZSBcIlwiOlxuICAgICAgICByZXR1cm4gdG9GaXhlZChyZW1haW5kZXIpO1xuICAgICAgY2FzZSBcIjxcIjpcbiAgICAgICAgcmV0dXJuIG5lZ2F0ZShyZW1haW5kZXIpO1xuICAgICAgY2FzZSBcIj5cIjoge1xuICAgICAgICAvLyBhbmQoID49LCBub3QoID0gKSApID0+ID49LCA9LCBub3QsIGFuZFxuICAgICAgICBjb25zdCBmaXhlZCA9IHRvRml4ZWQocmVtYWluZGVyKTtcbiAgICAgICAgcmV0dXJuIFssIGZpeGVkLCAwLCByZW1haW5kZXIsIDJdO1xuICAgICAgfVxuICAgICAgY2FzZSBcIjw9XCI6XG4gICAgICAgIC8vIG9yKCA8LCA9ICkgPT4gPCwgPSwgb3JcbiAgICAgICAgcmV0dXJuIFssIHRvRml4ZWQocmVtYWluZGVyKSwgbmVnYXRlKHJlbWFpbmRlciksIDFdO1xuICAgICAgY2FzZSBcIiFcIjoge1xuICAgICAgICAvLyBub3QgPVxuICAgICAgICBjb25zdCBmaXhlZCA9IHRvRml4ZWQocmVtYWluZGVyKTtcbiAgICAgICAgcmV0dXJuIFssIGZpeGVkLCAwXTtcbiAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuZXhwZWN0ZWQgc3RhcnQgdmFsdWVcIik7XG4gICAgfVxuICB9O1xuICB2YXIgY29tYmluZSA9IGZ1bmN0aW9uKGl0ZW1zLCBmbikge1xuICAgIGlmIChpdGVtcy5sZW5ndGggPT09IDEpIHJldHVybiBpdGVtc1swXTtcbiAgICBjb25zdCBhcnIgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMuc2xpY2UoKS5yZXZlcnNlKCkpIHtcbiAgICAgIGlmICgwIGluIGl0ZW0pIHtcbiAgICAgICAgYXJyLnB1c2goaXRlbSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhcnIucHVzaC5hcHBseShhcnIsIGl0ZW0uc2xpY2UoMSkpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gWyxdLmNvbmNhdChhcnIsIGl0ZW1zLnNsaWNlKDEpLm1hcCgoKSA9PiBmbikpO1xuICB9O1xuICB2YXIgcGFyc2VSYW5nZSA9IGZ1bmN0aW9uKHN0cikge1xuICAgIC8vIHJhbmdlICAgICAgOjo9IGh5cGhlbiB8IHNpbXBsZSAoICcgJyAoICcgJyApICogc2ltcGxlICkgKiB8ICcnXG4gICAgLy8gaHlwaGVuICAgICA6Oj0gcGFydGlhbCAoICcgJyApICogJyAtICcgKCAnICcgKSAqIHBhcnRpYWxcbiAgICBjb25zdCBpdGVtcyA9IHN0ci5zcGxpdCgvXFxzKy1cXHMrLyk7XG4gICAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0c3RyID0gc3RyLnRyaW0oKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW107XG5cdFx0XHRjb25zdCByID0gL1stMC05QS1aYS16XVxccysvZztcblx0XHRcdHZhciBzdGFydCA9IDA7XG5cdFx0XHR2YXIgbWF0Y2g7XG5cdFx0XHR3aGlsZSAoKG1hdGNoID0gci5leGVjKHN0cikpKSB7XG5cdFx0XHRcdGNvbnN0IGVuZCA9IG1hdGNoLmluZGV4ICsgMTtcblx0XHRcdFx0aXRlbXMucHVzaChwYXJzZVNpbXBsZShzdHIuc2xpY2Uoc3RhcnQsIGVuZCkudHJpbSgpKSk7XG5cdFx0XHRcdHN0YXJ0ID0gZW5kO1xuXHRcdFx0fVxuXHRcdFx0aXRlbXMucHVzaChwYXJzZVNpbXBsZShzdHIuc2xpY2Uoc3RhcnQpLnRyaW0oKSkpO1xuICAgICAgcmV0dXJuIGNvbWJpbmUoaXRlbXMsIDIpO1xuICAgIH1cbiAgICBjb25zdCBhID0gcGFyc2VQYXJ0aWFsKGl0ZW1zWzBdKTtcbiAgICBjb25zdCBiID0gcGFyc2VQYXJ0aWFsKGl0ZW1zWzFdKTtcbiAgICAvLyA+PWEgPD1iID0+IGFuZCggPj1hLCBvciggPGIsID1iICkgKSA9PiA+PWEsIDxiLCA9Yiwgb3IsIGFuZFxuICAgIHJldHVybiBbLCB0b0ZpeGVkKGIpLCBuZWdhdGUoYiksIDEsIGEsIDJdO1xuICB9O1xuICB2YXIgcGFyc2VMb2dpY2FsT3IgPSBmdW5jdGlvbihzdHIpIHtcbiAgICAvLyByYW5nZS1zZXQgIDo6PSByYW5nZSAoIGxvZ2ljYWwtb3IgcmFuZ2UgKSAqXG4gICAgLy8gbG9naWNhbC1vciA6Oj0gKCAnICcgKSAqICd8fCcgKCAnICcgKSAqXG4gICAgY29uc3QgaXRlbXMgPSBzdHIuc3BsaXQoL1xccypcXHxcXHxcXHMqLykubWFwKHBhcnNlUmFuZ2UpO1xuICAgIHJldHVybiBjb21iaW5lKGl0ZW1zLCAxKTtcbiAgfTtcbiAgcmV0dXJuIHBhcnNlTG9naWNhbE9yKHN0cik7XG59O1xudmFyIHBhcnNlVmVyc2lvbiA9IGZ1bmN0aW9uKHN0cikge1xuXHR2YXIgbWF0Y2ggPSAvXihbXi0rXSspPyg/Oi0oW14rXSspKT8oPzpcXCsoLispKT8kLy5leGVjKHN0cik7XG5cdC8qKiBAdHlwZSB7KHN0cmluZ3xudW1iZXJ8dW5kZWZpbmVkfFtdKVtdfSAqL1xuXHR2YXIgdmVyID0gbWF0Y2hbMV0gPyBzcGxpdEFuZENvbnZlcnQobWF0Y2hbMV0pIDogW107XG5cdGlmIChtYXRjaFsyXSkge1xuXHRcdHZlci5sZW5ndGgrKztcblx0XHR2ZXIucHVzaC5hcHBseSh2ZXIsIHNwbGl0QW5kQ29udmVydChtYXRjaFsyXSkpO1xuXHR9XG5cdGlmIChtYXRjaFszXSkge1xuXHRcdHZlci5wdXNoKFtdKTtcblx0XHR2ZXIucHVzaC5hcHBseSh2ZXIsIHNwbGl0QW5kQ29udmVydChtYXRjaFszXSkpO1xuXHR9XG5cdHJldHVybiB2ZXI7XG59XG52YXIgdmVyc2lvbkx0ID0gZnVuY3Rpb24oYSwgYikge1xuXHRhID0gcGFyc2VWZXJzaW9uKGEpO1xuXHRiID0gcGFyc2VWZXJzaW9uKGIpO1xuXHR2YXIgaSA9IDA7XG5cdGZvciAoOzspIHtcblx0XHQvLyBhICAgICAgIGIgIEVPQSAgICAgb2JqZWN0ICB1bmRlZmluZWQgIG51bWJlciAgc3RyaW5nXG5cdFx0Ly8gRU9BICAgICAgICBhID09IGIgIGEgPCBiICAgYiA8IGEgICAgICBhIDwgYiAgIGEgPCBiXG5cdFx0Ly8gb2JqZWN0ICAgICBiIDwgYSAgICgwKSAgICAgYiA8IGEgICAgICBhIDwgYiAgIGEgPCBiXG5cdFx0Ly8gdW5kZWZpbmVkICBhIDwgYiAgIGEgPCBiICAgKDApICAgICAgICBhIDwgYiAgIGEgPCBiXG5cdFx0Ly8gbnVtYmVyICAgICBiIDwgYSAgIGIgPCBhICAgYiA8IGEgICAgICAoMSkgICAgIGEgPCBiXG5cdFx0Ly8gc3RyaW5nICAgICBiIDwgYSAgIGIgPCBhICAgYiA8IGEgICAgICBiIDwgYSAgICgxKVxuXHRcdC8vIEVPQSBlbmQgb2YgYXJyYXlcblx0XHQvLyAoMCkgY29udGludWUgb25cblx0XHQvLyAoMSkgY29tcGFyZSB0aGVtIHZpYSBcIjxcIlxuXG5cdFx0Ly8gSGFuZGxlcyBmaXJzdCByb3cgaW4gdGFibGVcblx0XHRpZiAoaSA+PSBhLmxlbmd0aCkgcmV0dXJuIGkgPCBiLmxlbmd0aCAmJiAodHlwZW9mIGJbaV0pWzBdICE9IFwidVwiO1xuXG5cdFx0dmFyIGFWYWx1ZSA9IGFbaV07XG5cdFx0dmFyIGFUeXBlID0gKHR5cGVvZiBhVmFsdWUpWzBdO1xuXG5cdFx0Ly8gSGFuZGxlcyBmaXJzdCBjb2x1bW4gaW4gdGFibGVcblx0XHRpZiAoaSA+PSBiLmxlbmd0aCkgcmV0dXJuIGFUeXBlID09IFwidVwiO1xuXG5cdFx0dmFyIGJWYWx1ZSA9IGJbaV07XG5cdFx0dmFyIGJUeXBlID0gKHR5cGVvZiBiVmFsdWUpWzBdO1xuXG5cdFx0aWYgKGFUeXBlID09IGJUeXBlKSB7XG5cdFx0XHRpZiAoYVR5cGUgIT0gXCJvXCIgJiYgYVR5cGUgIT0gXCJ1XCIgJiYgYVZhbHVlICE9IGJWYWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gYVZhbHVlIDwgYlZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0aSsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBIYW5kbGVzIHJlbWFpbmluZyBjYXNlc1xuXHRcdFx0aWYgKGFUeXBlID09IFwib1wiICYmIGJUeXBlID09IFwiblwiKSByZXR1cm4gdHJ1ZTtcblx0XHRcdHJldHVybiBiVHlwZSA9PSBcInNcIiB8fCBhVHlwZSA9PSBcInVcIjtcblx0XHR9XG5cdH1cbn1cbnZhciByYW5nZVRvU3RyaW5nID0gZnVuY3Rpb24ocmFuZ2UpIHtcblx0dmFyIGZpeENvdW50ID0gcmFuZ2VbMF07XG5cdHZhciBzdHIgPSBcIlwiO1xuXHRpZiAocmFuZ2UubGVuZ3RoID09PSAxKSB7XG5cdFx0cmV0dXJuIFwiKlwiO1xuXHR9IGVsc2UgaWYgKGZpeENvdW50ICsgMC41KSB7XG5cdFx0c3RyICs9XG5cdFx0XHRmaXhDb3VudCA9PSAwXG5cdFx0XHRcdD8gXCI+PVwiXG5cdFx0XHRcdDogZml4Q291bnQgPT0gLTFcblx0XHRcdFx0PyBcIjxcIlxuXHRcdFx0XHQ6IGZpeENvdW50ID09IDFcblx0XHRcdFx0PyBcIl5cIlxuXHRcdFx0XHQ6IGZpeENvdW50ID09IDJcblx0XHRcdFx0PyBcIn5cIlxuXHRcdFx0XHQ6IGZpeENvdW50ID4gMFxuXHRcdFx0XHQ/IFwiPVwiXG5cdFx0XHRcdDogXCIhPVwiO1xuXHRcdHZhciBuZWVkRG90ID0gMTtcblx0XHRmb3IgKHZhciBpID0gMTsgaSA8IHJhbmdlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR2YXIgaXRlbSA9IHJhbmdlW2ldO1xuXHRcdFx0dmFyIHQgPSAodHlwZW9mIGl0ZW0pWzBdO1xuXHRcdFx0bmVlZERvdC0tO1xuXHRcdFx0c3RyICs9XG5cdFx0XHRcdHQgPT0gXCJ1XCJcblx0XHRcdFx0XHQ/IC8vIHVuZGVmaW5lZDogcHJlcmVsZWFzZSBtYXJrZXIsIGFkZCBhbiBcIi1cIlxuXHRcdFx0XHRcdCAgXCItXCJcblx0XHRcdFx0XHQ6IC8vIG51bWJlciBvciBzdHJpbmc6IGFkZCB0aGUgaXRlbSwgc2V0IGZsYWcgdG8gYWRkIGFuIFwiLlwiIGJldHdlZW4gdHdvIG9mIHRoZW1cblx0XHRcdFx0XHQgIChuZWVkRG90ID4gMCA/IFwiLlwiIDogXCJcIikgKyAoKG5lZWREb3QgPSAyKSwgaXRlbSk7XG5cdFx0fVxuXHRcdHJldHVybiBzdHI7XG5cdH0gZWxzZSB7XG5cdFx0dmFyIHN0YWNrID0gW107XG5cdFx0Zm9yICh2YXIgaSA9IDE7IGkgPCByYW5nZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0dmFyIGl0ZW0gPSByYW5nZVtpXTtcblx0XHRcdHN0YWNrLnB1c2goXG5cdFx0XHRcdGl0ZW0gPT09IDBcblx0XHRcdFx0XHQ/IFwibm90KFwiICsgcG9wKCkgKyBcIilcIlxuXHRcdFx0XHRcdDogaXRlbSA9PT0gMVxuXHRcdFx0XHRcdD8gXCIoXCIgKyBwb3AoKSArIFwiIHx8IFwiICsgcG9wKCkgKyBcIilcIlxuXHRcdFx0XHRcdDogaXRlbSA9PT0gMlxuXHRcdFx0XHRcdD8gc3RhY2sucG9wKCkgKyBcIiBcIiArIHN0YWNrLnBvcCgpXG5cdFx0XHRcdFx0OiByYW5nZVRvU3RyaW5nKGl0ZW0pXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcG9wKCk7XG5cdH1cblx0ZnVuY3Rpb24gcG9wKCkge1xuXHRcdHJldHVybiBzdGFjay5wb3AoKS5yZXBsYWNlKC9eXFwoKC4rKVxcKSQvLCBcIiQxXCIpO1xuXHR9XG59XG52YXIgc2F0aXNmeSA9IGZ1bmN0aW9uKHJhbmdlLCB2ZXJzaW9uKSB7XG5cdGlmICgwIGluIHJhbmdlKSB7XG5cdFx0dmVyc2lvbiA9IHBhcnNlVmVyc2lvbih2ZXJzaW9uKTtcblx0XHR2YXIgZml4Q291bnQgPSAvKiogQHR5cGUge251bWJlcn0gKi8gKHJhbmdlWzBdKTtcblx0XHQvLyB3aGVuIG5lZ2F0ZWQgaXMgc2V0IGl0IHN3aWxsIHNldCBmb3IgPCBpbnN0ZWFkIG9mID49XG5cdFx0dmFyIG5lZ2F0ZWQgPSBmaXhDb3VudCA8IDA7XG5cdFx0aWYgKG5lZ2F0ZWQpIGZpeENvdW50ID0gLWZpeENvdW50IC0gMTtcblx0XHRmb3IgKHZhciBpID0gMCwgaiA9IDEsIGlzRXF1YWwgPSB0cnVlOyA7IGorKywgaSsrKSB7XG5cdFx0XHQvLyBjc3BlbGw6d29yZCBuZXF1YWwgbmVxdVxuXG5cdFx0XHQvLyB3aGVuIGlzRXF1YWwgPSB0cnVlOlxuXHRcdFx0Ly8gcmFuZ2UgICAgICAgICB2ZXJzaW9uOiBFT0Evb2JqZWN0ICB1bmRlZmluZWQgIG51bWJlciAgICBzdHJpbmdcblx0XHRcdC8vIEVPQSAgICAgICAgICAgICAgICAgICAgZXF1YWwgICAgICAgYmxvY2sgICAgICBiaWctdmVyICAgYmlnLXZlclxuXHRcdFx0Ly8gdW5kZWZpbmVkICAgICAgICAgICAgICBiaWdnZXIgICAgICBuZXh0ICAgICAgIGJpZy12ZXIgICBiaWctdmVyXG5cdFx0XHQvLyBudW1iZXIgICAgICAgICAgICAgICAgIHNtYWxsZXIgICAgIGJsb2NrICAgICAgY21wICAgICAgIGJpZy1jbXBcblx0XHRcdC8vIGZpeGVkIG51bWJlciAgICAgICAgICAgc21hbGxlciAgICAgYmxvY2sgICAgICBjbXAtZml4ICAgZGlmZmVyXG5cdFx0XHQvLyBzdHJpbmcgICAgICAgICAgICAgICAgIHNtYWxsZXIgICAgIGJsb2NrICAgICAgZGlmZmVyICAgIGNtcFxuXHRcdFx0Ly8gZml4ZWQgc3RyaW5nICAgICAgICAgICBzbWFsbGVyICAgICBibG9jayAgICAgIHNtYWxsLWNtcCBjbXAtZml4XG5cblx0XHRcdC8vIHdoZW4gaXNFcXVhbCA9IGZhbHNlOlxuXHRcdFx0Ly8gcmFuZ2UgICAgICAgICB2ZXJzaW9uOiBFT0Evb2JqZWN0ICB1bmRlZmluZWQgIG51bWJlciAgICBzdHJpbmdcblx0XHRcdC8vIEVPQSAgICAgICAgICAgICAgICAgICAgbmVxdWFsICAgICAgYmxvY2sgICAgICBuZXh0LXZlciAgbmV4dC12ZXJcblx0XHRcdC8vIHVuZGVmaW5lZCAgICAgICAgICAgICAgbmVxdWFsICAgICAgYmxvY2sgICAgICBuZXh0LXZlciAgbmV4dC12ZXJcblx0XHRcdC8vIG51bWJlciAgICAgICAgICAgICAgICAgbmVxdWFsICAgICAgYmxvY2sgICAgICBuZXh0ICAgICAgbmV4dFxuXHRcdFx0Ly8gZml4ZWQgbnVtYmVyICAgICAgICAgICBuZXF1YWwgICAgICBibG9jayAgICAgIG5leHQgICAgICBuZXh0ICAgKHRoaXMgbmV2ZXIgaGFwcGVucylcblx0XHRcdC8vIHN0cmluZyAgICAgICAgICAgICAgICAgbmVxdWFsICAgICAgYmxvY2sgICAgICBuZXh0ICAgICAgbmV4dFxuXHRcdFx0Ly8gZml4ZWQgc3RyaW5nICAgICAgICAgICBuZXF1YWwgICAgICBibG9jayAgICAgIG5leHQgICAgICBuZXh0ICAgKHRoaXMgbmV2ZXIgaGFwcGVucylcblxuXHRcdFx0Ly8gRU9BIGVuZCBvZiBhcnJheVxuXHRcdFx0Ly8gZXF1YWwgKHZlcnNpb24gaXMgZXF1YWwgcmFuZ2UpOlxuXHRcdFx0Ly8gICB3aGVuICFuZWdhdGVkOiByZXR1cm4gdHJ1ZSxcblx0XHRcdC8vICAgd2hlbiBuZWdhdGVkOiByZXR1cm4gZmFsc2Vcblx0XHRcdC8vIGJpZ2dlciAodmVyc2lvbiBpcyBiaWdnZXIgYXMgcmFuZ2UpOlxuXHRcdFx0Ly8gICB3aGVuIGZpeGVkOiByZXR1cm4gZmFsc2UsXG5cdFx0XHQvLyAgIHdoZW4gIW5lZ2F0ZWQ6IHJldHVybiB0cnVlLFxuXHRcdFx0Ly8gICB3aGVuIG5lZ2F0ZWQ6IHJldHVybiBmYWxzZSxcblx0XHRcdC8vIHNtYWxsZXIgKHZlcnNpb24gaXMgc21hbGxlciBhcyByYW5nZSk6XG5cdFx0XHQvLyAgIHdoZW4gIW5lZ2F0ZWQ6IHJldHVybiBmYWxzZSxcblx0XHRcdC8vICAgd2hlbiBuZWdhdGVkOiByZXR1cm4gdHJ1ZVxuXHRcdFx0Ly8gbmVxdWFsICh2ZXJzaW9uIGlzIG5vdCBlcXVhbCByYW5nZSAoPiByZXNwIDwpKTogcmV0dXJuIHRydWVcblx0XHRcdC8vIGJsb2NrICh2ZXJzaW9uIGlzIGluIGRpZmZlcmVudCBwcmVyZWxlYXNlIGFyZWEpOiByZXR1cm4gZmFsc2Vcblx0XHRcdC8vIGRpZmZlciAodmVyc2lvbiBpcyBkaWZmZXJlbnQgZnJvbSBmaXhlZCByYW5nZSAoc3RyaW5nIHZzLiBudW1iZXIpKTogcmV0dXJuIGZhbHNlXG5cdFx0XHQvLyBuZXh0OiBjb250aW51ZXMgdG8gdGhlIG5leHQgaXRlbXNcblx0XHRcdC8vIG5leHQtdmVyOiB3aGVuIGZpeGVkOiByZXR1cm4gZmFsc2UsIGNvbnRpbnVlcyB0byB0aGUgbmV4dCBpdGVtIG9ubHkgZm9yIHRoZSB2ZXJzaW9uLCBzZXRzIGlzRXF1YWw9ZmFsc2Vcblx0XHRcdC8vIGJpZy12ZXI6IHdoZW4gZml4ZWQgfHwgbmVnYXRlZDogcmV0dXJuIGZhbHNlLCBjb250aW51ZXMgdG8gdGhlIG5leHQgaXRlbSBvbmx5IGZvciB0aGUgdmVyc2lvbiwgc2V0cyBpc0VxdWFsPWZhbHNlXG5cdFx0XHQvLyBuZXh0LW5lcXU6IGNvbnRpbnVlcyB0byB0aGUgbmV4dCBpdGVtcywgc2V0cyBpc0VxdWFsPWZhbHNlXG5cdFx0XHQvLyBjbXAgKG5lZ2F0ZWQgPT09IGZhbHNlKTogdmVyc2lvbiA8IHJhbmdlID0+IHJldHVybiBmYWxzZSwgdmVyc2lvbiA+IHJhbmdlID0+IG5leHQtbmVxdSwgZWxzZSA9PiBuZXh0XG5cdFx0XHQvLyBjbXAgKG5lZ2F0ZWQgPT09IHRydWUpOiB2ZXJzaW9uID4gcmFuZ2UgPT4gcmV0dXJuIGZhbHNlLCB2ZXJzaW9uIDwgcmFuZ2UgPT4gbmV4dC1uZXF1LCBlbHNlID0+IG5leHRcblx0XHRcdC8vIGNtcC1maXg6IHZlcnNpb24gPT0gcmFuZ2UgPT4gbmV4dCwgZWxzZSA9PiByZXR1cm4gZmFsc2Vcblx0XHRcdC8vIGJpZy1jbXA6IHdoZW4gbmVnYXRlZCA9PiByZXR1cm4gZmFsc2UsIGVsc2UgPT4gbmV4dC1uZXF1XG5cdFx0XHQvLyBzbWFsbC1jbXA6IHdoZW4gbmVnYXRlZCA9PiBuZXh0LW5lcXUsIGVsc2UgPT4gcmV0dXJuIGZhbHNlXG5cblx0XHRcdHZhciByYW5nZVR5cGUgPSBqIDwgcmFuZ2UubGVuZ3RoID8gKHR5cGVvZiByYW5nZVtqXSlbMF0gOiBcIlwiO1xuXG5cdFx0XHR2YXIgdmVyc2lvblZhbHVlO1xuXHRcdFx0dmFyIHZlcnNpb25UeXBlO1xuXG5cdFx0XHQvLyBIYW5kbGVzIGZpcnN0IGNvbHVtbiBpbiBib3RoIHRhYmxlcyAoZW5kIG9mIHZlcnNpb24gb3Igb2JqZWN0KVxuXHRcdFx0aWYgKFxuXHRcdFx0XHRpID49IHZlcnNpb24ubGVuZ3RoIHx8XG5cdFx0XHRcdCgodmVyc2lvblZhbHVlID0gdmVyc2lvbltpXSksXG5cdFx0XHRcdCh2ZXJzaW9uVHlwZSA9ICh0eXBlb2YgdmVyc2lvblZhbHVlKVswXSkgPT0gXCJvXCIpXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gSGFuZGxlcyBuZXF1YWxcblx0XHRcdFx0aWYgKCFpc0VxdWFsKSByZXR1cm4gdHJ1ZTtcblx0XHRcdFx0Ly8gSGFuZGxlcyBiaWdnZXJcblx0XHRcdFx0aWYgKHJhbmdlVHlwZSA9PSBcInVcIikgcmV0dXJuIGogPiBmaXhDb3VudCAmJiAhbmVnYXRlZDtcblx0XHRcdFx0Ly8gSGFuZGxlcyBlcXVhbCBhbmQgc21hbGxlcjogKHJhbmdlID09PSBFT0EpIFhPUiBuZWdhdGVkXG5cdFx0XHRcdHJldHVybiAocmFuZ2VUeXBlID09IFwiXCIpICE9IG5lZ2F0ZWQ7IC8vIGVxdWFsICsgc21hbGxlclxuXHRcdFx0fVxuXG5cdFx0XHQvLyBIYW5kbGVzIHNlY29uZCBjb2x1bW4gaW4gYm90aCB0YWJsZXMgKHZlcnNpb24gPSB1bmRlZmluZWQpXG5cdFx0XHRpZiAodmVyc2lvblR5cGUgPT0gXCJ1XCIpIHtcblx0XHRcdFx0aWYgKCFpc0VxdWFsIHx8IHJhbmdlVHlwZSAhPSBcInVcIikge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBzd2l0Y2ggYmV0d2VlbiBmaXJzdCBhbmQgc2Vjb25kIHRhYmxlXG5cdFx0XHRlbHNlIGlmIChpc0VxdWFsKSB7XG5cdFx0XHRcdC8vIEhhbmRsZSBkaWFnb25hbFxuXHRcdFx0XHRpZiAocmFuZ2VUeXBlID09IHZlcnNpb25UeXBlKSB7XG5cdFx0XHRcdFx0aWYgKGogPD0gZml4Q291bnQpIHtcblx0XHRcdFx0XHRcdC8vIEhhbmRsZXMgXCJjbXAtZml4XCIgY2FzZXNcblx0XHRcdFx0XHRcdGlmICh2ZXJzaW9uVmFsdWUgIT0gcmFuZ2Vbal0pIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBIYW5kbGVzIFwiY21wXCIgY2FzZXNcblx0XHRcdFx0XHRcdGlmIChuZWdhdGVkID8gdmVyc2lvblZhbHVlID4gcmFuZ2Vbal0gOiB2ZXJzaW9uVmFsdWUgPCByYW5nZVtqXSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodmVyc2lvblZhbHVlICE9IHJhbmdlW2pdKSBpc0VxdWFsID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSGFuZGxlIGJpZy12ZXJcblx0XHRcdFx0ZWxzZSBpZiAocmFuZ2VUeXBlICE9IFwic1wiICYmIHJhbmdlVHlwZSAhPSBcIm5cIikge1xuXHRcdFx0XHRcdGlmIChuZWdhdGVkIHx8IGogPD0gZml4Q291bnQpIHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRpc0VxdWFsID0gZmFsc2U7XG5cdFx0XHRcdFx0ai0tO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSGFuZGxlIGRpZmZlciwgYmlnLWNtcCBhbmQgc21hbGwtY21wXG5cdFx0XHRcdGVsc2UgaWYgKGogPD0gZml4Q291bnQgfHwgdmVyc2lvblR5cGUgPCByYW5nZVR5cGUgIT0gbmVnYXRlZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpc0VxdWFsID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEhhbmRsZXMgYWxsIFwibmV4dC12ZXJcIiBjYXNlcyBpbiB0aGUgc2Vjb25kIHRhYmxlXG5cdFx0XHRcdGlmIChyYW5nZVR5cGUgIT0gXCJzXCIgJiYgcmFuZ2VUeXBlICE9IFwiblwiKSB7XG5cdFx0XHRcdFx0aXNFcXVhbCA9IGZhbHNlO1xuXHRcdFx0XHRcdGotLTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIG5leHQgaXMgYXBwbGllZCBieSBkZWZhdWx0XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdC8qKiBAdHlwZSB7KGJvb2xlYW4gfCBudW1iZXIpW119ICovXG5cdHZhciBzdGFjayA9IFtdO1xuXHR2YXIgcCA9IHN0YWNrLnBvcC5iaW5kKHN0YWNrKTtcblx0Zm9yICh2YXIgaSA9IDE7IGkgPCByYW5nZS5sZW5ndGg7IGkrKykge1xuXHRcdHZhciBpdGVtID0gLyoqIEB0eXBlIHtTZW1WZXJSYW5nZSB8IDAgfCAxIHwgMn0gKi8gKHJhbmdlW2ldKTtcblx0XHRzdGFjay5wdXNoKFxuXHRcdFx0aXRlbSA9PSAxXG5cdFx0XHRcdD8gcCgpIHwgcCgpXG5cdFx0XHRcdDogaXRlbSA9PSAyXG5cdFx0XHRcdD8gcCgpICYgcCgpXG5cdFx0XHRcdDogaXRlbVxuXHRcdFx0XHQ/IHNhdGlzZnkoaXRlbSwgdmVyc2lvbilcblx0XHRcdFx0OiAhcCgpXG5cdFx0KTtcblx0fVxuXHRyZXR1cm4gISFwKCk7XG59XG52YXIgZW5zdXJlRXhpc3RlbmNlID0gZnVuY3Rpb24oc2NvcGVOYW1lLCBrZXkpIHtcblx0dmFyIHNjb3BlID0gX193ZWJwYWNrX3JlcXVpcmVfXy5TW3Njb3BlTmFtZV07XG5cdGlmKCFzY29wZSB8fCAhX193ZWJwYWNrX3JlcXVpcmVfXy5vKHNjb3BlLCBrZXkpKSB0aHJvdyBuZXcgRXJyb3IoXCJTaGFyZWQgbW9kdWxlIFwiICsga2V5ICsgXCIgZG9lc24ndCBleGlzdCBpbiBzaGFyZWQgc2NvcGUgXCIgKyBzY29wZU5hbWUpO1xuXHRyZXR1cm4gc2NvcGU7XG59O1xudmFyIGZpbmRWZXJzaW9uID0gZnVuY3Rpb24oc2NvcGUsIGtleSkge1xuXHR2YXIgdmVyc2lvbnMgPSBzY29wZVtrZXldO1xuXHR2YXIga2V5ID0gT2JqZWN0LmtleXModmVyc2lvbnMpLnJlZHVjZShmdW5jdGlvbihhLCBiKSB7XG5cdFx0cmV0dXJuICFhIHx8IHZlcnNpb25MdChhLCBiKSA/IGIgOiBhO1xuXHR9LCAwKTtcblx0cmV0dXJuIGtleSAmJiB2ZXJzaW9uc1trZXldXG59O1xudmFyIGZpbmRTaW5nbGV0b25WZXJzaW9uS2V5ID0gZnVuY3Rpb24oc2NvcGUsIGtleSkge1xuXHR2YXIgdmVyc2lvbnMgPSBzY29wZVtrZXldO1xuXHRyZXR1cm4gT2JqZWN0LmtleXModmVyc2lvbnMpLnJlZHVjZShmdW5jdGlvbihhLCBiKSB7XG5cdFx0cmV0dXJuICFhIHx8ICghdmVyc2lvbnNbYV0ubG9hZGVkICYmIHZlcnNpb25MdChhLCBiKSkgPyBiIDogYTtcblx0fSwgMCk7XG59O1xudmFyIGdldEludmFsaWRTaW5nbGV0b25WZXJzaW9uTWVzc2FnZSA9IGZ1bmN0aW9uKHNjb3BlLCBrZXksIHZlcnNpb24sIHJlcXVpcmVkVmVyc2lvbikge1xuXHRyZXR1cm4gXCJVbnNhdGlzZmllZCB2ZXJzaW9uIFwiICsgdmVyc2lvbiArIFwiIGZyb20gXCIgKyAodmVyc2lvbiAmJiBzY29wZVtrZXldW3ZlcnNpb25dLmZyb20pICsgXCIgb2Ygc2hhcmVkIHNpbmdsZXRvbiBtb2R1bGUgXCIgKyBrZXkgKyBcIiAocmVxdWlyZWQgXCIgKyByYW5nZVRvU3RyaW5nKHJlcXVpcmVkVmVyc2lvbikgKyBcIilcIlxufTtcbnZhciBnZXRTaW5nbGV0b24gPSBmdW5jdGlvbihzY29wZSwgc2NvcGVOYW1lLCBrZXksIHJlcXVpcmVkVmVyc2lvbikge1xuXHR2YXIgdmVyc2lvbiA9IGZpbmRTaW5nbGV0b25WZXJzaW9uS2V5KHNjb3BlLCBrZXkpO1xuXHRyZXR1cm4gZ2V0KHNjb3BlW2tleV1bdmVyc2lvbl0pO1xufTtcbnZhciBnZXRTaW5nbGV0b25WZXJzaW9uID0gZnVuY3Rpb24oc2NvcGUsIHNjb3BlTmFtZSwga2V5LCByZXF1aXJlZFZlcnNpb24pIHtcblx0dmFyIHZlcnNpb24gPSBmaW5kU2luZ2xldG9uVmVyc2lvbktleShzY29wZSwga2V5KTtcblx0aWYgKCFzYXRpc2Z5KHJlcXVpcmVkVmVyc2lvbiwgdmVyc2lvbikpIHdhcm4oZ2V0SW52YWxpZFNpbmdsZXRvblZlcnNpb25NZXNzYWdlKHNjb3BlLCBrZXksIHZlcnNpb24sIHJlcXVpcmVkVmVyc2lvbikpO1xuXHRyZXR1cm4gZ2V0KHNjb3BlW2tleV1bdmVyc2lvbl0pO1xufTtcbnZhciBnZXRTdHJpY3RTaW5nbGV0b25WZXJzaW9uID0gZnVuY3Rpb24oc2NvcGUsIHNjb3BlTmFtZSwga2V5LCByZXF1aXJlZFZlcnNpb24pIHtcblx0dmFyIHZlcnNpb24gPSBmaW5kU2luZ2xldG9uVmVyc2lvbktleShzY29wZSwga2V5KTtcblx0aWYgKCFzYXRpc2Z5KHJlcXVpcmVkVmVyc2lvbiwgdmVyc2lvbikpIHRocm93IG5ldyBFcnJvcihnZXRJbnZhbGlkU2luZ2xldG9uVmVyc2lvbk1lc3NhZ2Uoc2NvcGUsIGtleSwgdmVyc2lvbiwgcmVxdWlyZWRWZXJzaW9uKSk7XG5cdHJldHVybiBnZXQoc2NvcGVba2V5XVt2ZXJzaW9uXSk7XG59O1xudmFyIGZpbmRWYWxpZFZlcnNpb24gPSBmdW5jdGlvbihzY29wZSwga2V5LCByZXF1aXJlZFZlcnNpb24pIHtcblx0dmFyIHZlcnNpb25zID0gc2NvcGVba2V5XTtcblx0dmFyIGtleSA9IE9iamVjdC5rZXlzKHZlcnNpb25zKS5yZWR1Y2UoZnVuY3Rpb24oYSwgYikge1xuXHRcdGlmICghc2F0aXNmeShyZXF1aXJlZFZlcnNpb24sIGIpKSByZXR1cm4gYTtcblx0XHRyZXR1cm4gIWEgfHwgdmVyc2lvbkx0KGEsIGIpID8gYiA6IGE7XG5cdH0sIDApO1xuXHRyZXR1cm4ga2V5ICYmIHZlcnNpb25zW2tleV1cbn07XG52YXIgZ2V0SW52YWxpZFZlcnNpb25NZXNzYWdlID0gZnVuY3Rpb24oc2NvcGUsIHNjb3BlTmFtZSwga2V5LCByZXF1aXJlZFZlcnNpb24pIHtcblx0dmFyIHZlcnNpb25zID0gc2NvcGVba2V5XTtcblx0cmV0dXJuIFwiTm8gc2F0aXNmeWluZyB2ZXJzaW9uIChcIiArIHJhbmdlVG9TdHJpbmcocmVxdWlyZWRWZXJzaW9uKSArIFwiKSBvZiBzaGFyZWQgbW9kdWxlIFwiICsga2V5ICsgXCIgZm91bmQgaW4gc2hhcmVkIHNjb3BlIFwiICsgc2NvcGVOYW1lICsgXCIuXFxuXCIgK1xuXHRcdFwiQXZhaWxhYmxlIHZlcnNpb25zOiBcIiArIE9iamVjdC5rZXlzKHZlcnNpb25zKS5tYXAoZnVuY3Rpb24oa2V5KSB7XG5cdFx0cmV0dXJuIGtleSArIFwiIGZyb20gXCIgKyB2ZXJzaW9uc1trZXldLmZyb207XG5cdH0pLmpvaW4oXCIsIFwiKTtcbn07XG52YXIgZ2V0VmFsaWRWZXJzaW9uID0gZnVuY3Rpb24oc2NvcGUsIHNjb3BlTmFtZSwga2V5LCByZXF1aXJlZFZlcnNpb24pIHtcblx0dmFyIGVudHJ5ID0gZmluZFZhbGlkVmVyc2lvbihzY29wZSwga2V5LCByZXF1aXJlZFZlcnNpb24pO1xuXHRpZihlbnRyeSkgcmV0dXJuIGdldChlbnRyeSk7XG5cdHRocm93IG5ldyBFcnJvcihnZXRJbnZhbGlkVmVyc2lvbk1lc3NhZ2Uoc2NvcGUsIHNjb3BlTmFtZSwga2V5LCByZXF1aXJlZFZlcnNpb24pKTtcbn07XG52YXIgd2FybiA9IGZ1bmN0aW9uKG1zZykge1xuXHRpZiAodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIgJiYgY29uc29sZS53YXJuKSBjb25zb2xlLndhcm4obXNnKTtcbn07XG52YXIgd2FybkludmFsaWRWZXJzaW9uID0gZnVuY3Rpb24oc2NvcGUsIHNjb3BlTmFtZSwga2V5LCByZXF1aXJlZFZlcnNpb24pIHtcblx0d2FybihnZXRJbnZhbGlkVmVyc2lvbk1lc3NhZ2Uoc2NvcGUsIHNjb3BlTmFtZSwga2V5LCByZXF1aXJlZFZlcnNpb24pKTtcbn07XG52YXIgZ2V0ID0gZnVuY3Rpb24oZW50cnkpIHtcblx0ZW50cnkubG9hZGVkID0gMTtcblx0cmV0dXJuIGVudHJ5LmdldCgpXG59O1xudmFyIGluaXQgPSBmdW5jdGlvbihmbikgeyByZXR1cm4gZnVuY3Rpb24oc2NvcGVOYW1lLCBhLCBiLCBjKSB7XG5cdHZhciBwcm9taXNlID0gX193ZWJwYWNrX3JlcXVpcmVfXy5JKHNjb3BlTmFtZSk7XG5cdGlmIChwcm9taXNlICYmIHByb21pc2UudGhlbikgcmV0dXJuIHByb21pc2UudGhlbihmbi5iaW5kKGZuLCBzY29wZU5hbWUsIF9fd2VicGFja19yZXF1aXJlX18uU1tzY29wZU5hbWVdLCBhLCBiLCBjKSk7XG5cdHJldHVybiBmbihzY29wZU5hbWUsIF9fd2VicGFja19yZXF1aXJlX18uU1tzY29wZU5hbWVdLCBhLCBiLCBjKTtcbn07IH07XG5cbnZhciBsb2FkID0gLyojX19QVVJFX18qLyBpbml0KGZ1bmN0aW9uKHNjb3BlTmFtZSwgc2NvcGUsIGtleSkge1xuXHRlbnN1cmVFeGlzdGVuY2Uoc2NvcGVOYW1lLCBrZXkpO1xuXHRyZXR1cm4gZ2V0KGZpbmRWZXJzaW9uKHNjb3BlLCBrZXkpKTtcbn0pO1xudmFyIGxvYWRGYWxsYmFjayA9IC8qI19fUFVSRV9fKi8gaW5pdChmdW5jdGlvbihzY29wZU5hbWUsIHNjb3BlLCBrZXksIGZhbGxiYWNrKSB7XG5cdHJldHVybiBzY29wZSAmJiBfX3dlYnBhY2tfcmVxdWlyZV9fLm8oc2NvcGUsIGtleSkgPyBnZXQoZmluZFZlcnNpb24oc2NvcGUsIGtleSkpIDogZmFsbGJhY2soKTtcbn0pO1xudmFyIGxvYWRWZXJzaW9uQ2hlY2sgPSAvKiNfX1BVUkVfXyovIGluaXQoZnVuY3Rpb24oc2NvcGVOYW1lLCBzY29wZSwga2V5LCB2ZXJzaW9uKSB7XG5cdGVuc3VyZUV4aXN0ZW5jZShzY29wZU5hbWUsIGtleSk7XG5cdHJldHVybiBnZXQoZmluZFZhbGlkVmVyc2lvbihzY29wZSwga2V5LCB2ZXJzaW9uKSB8fCB3YXJuSW52YWxpZFZlcnNpb24oc2NvcGUsIHNjb3BlTmFtZSwga2V5LCB2ZXJzaW9uKSB8fCBmaW5kVmVyc2lvbihzY29wZSwga2V5KSk7XG59KTtcbnZhciBsb2FkU2luZ2xldG9uID0gLyojX19QVVJFX18qLyBpbml0KGZ1bmN0aW9uKHNjb3BlTmFtZSwgc2NvcGUsIGtleSkge1xuXHRlbnN1cmVFeGlzdGVuY2Uoc2NvcGVOYW1lLCBrZXkpO1xuXHRyZXR1cm4gZ2V0U2luZ2xldG9uKHNjb3BlLCBzY29wZU5hbWUsIGtleSk7XG59KTtcbnZhciBsb2FkU2luZ2xldG9uVmVyc2lvbkNoZWNrID0gLyojX19QVVJFX18qLyBpbml0KGZ1bmN0aW9uKHNjb3BlTmFtZSwgc2NvcGUsIGtleSwgdmVyc2lvbikge1xuXHRlbnN1cmVFeGlzdGVuY2Uoc2NvcGVOYW1lLCBrZXkpO1xuXHRyZXR1cm4gZ2V0U2luZ2xldG9uVmVyc2lvbihzY29wZSwgc2NvcGVOYW1lLCBrZXksIHZlcnNpb24pO1xufSk7XG52YXIgbG9hZFN0cmljdFZlcnNpb25DaGVjayA9IC8qI19fUFVSRV9fKi8gaW5pdChmdW5jdGlvbihzY29wZU5hbWUsIHNjb3BlLCBrZXksIHZlcnNpb24pIHtcblx0ZW5zdXJlRXhpc3RlbmNlKHNjb3BlTmFtZSwga2V5KTtcblx0cmV0dXJuIGdldFZhbGlkVmVyc2lvbihzY29wZSwgc2NvcGVOYW1lLCBrZXksIHZlcnNpb24pO1xufSk7XG52YXIgbG9hZFN0cmljdFNpbmdsZXRvblZlcnNpb25DaGVjayA9IC8qI19fUFVSRV9fKi8gaW5pdChmdW5jdGlvbihzY29wZU5hbWUsIHNjb3BlLCBrZXksIHZlcnNpb24pIHtcblx0ZW5zdXJlRXhpc3RlbmNlKHNjb3BlTmFtZSwga2V5KTtcblx0cmV0dXJuIGdldFN0cmljdFNpbmdsZXRvblZlcnNpb24oc2NvcGUsIHNjb3BlTmFtZSwga2V5LCB2ZXJzaW9uKTtcbn0pO1xudmFyIGxvYWRWZXJzaW9uQ2hlY2tGYWxsYmFjayA9IC8qI19fUFVSRV9fKi8gaW5pdChmdW5jdGlvbihzY29wZU5hbWUsIHNjb3BlLCBrZXksIHZlcnNpb24sIGZhbGxiYWNrKSB7XG5cdGlmKCFzY29wZSB8fCAhX193ZWJwYWNrX3JlcXVpcmVfXy5vKHNjb3BlLCBrZXkpKSByZXR1cm4gZmFsbGJhY2soKTtcblx0cmV0dXJuIGdldChmaW5kVmFsaWRWZXJzaW9uKHNjb3BlLCBrZXksIHZlcnNpb24pIHx8IHdhcm5JbnZhbGlkVmVyc2lvbihzY29wZSwgc2NvcGVOYW1lLCBrZXksIHZlcnNpb24pIHx8IGZpbmRWZXJzaW9uKHNjb3BlLCBrZXkpKTtcbn0pO1xudmFyIGxvYWRTaW5nbGV0b25GYWxsYmFjayA9IC8qI19fUFVSRV9fKi8gaW5pdChmdW5jdGlvbihzY29wZU5hbWUsIHNjb3BlLCBrZXksIGZhbGxiYWNrKSB7XG5cdGlmKCFzY29wZSB8fCAhX193ZWJwYWNrX3JlcXVpcmVfXy5vKHNjb3BlLCBrZXkpKSByZXR1cm4gZmFsbGJhY2soKTtcblx0cmV0dXJuIGdldFNpbmdsZXRvbihzY29wZSwgc2NvcGVOYW1lLCBrZXkpO1xufSk7XG52YXIgbG9hZFNpbmdsZXRvblZlcnNpb25DaGVja0ZhbGxiYWNrID0gLyojX19QVVJFX18qLyBpbml0KGZ1bmN0aW9uKHNjb3BlTmFtZSwgc2NvcGUsIGtleSwgdmVyc2lvbiwgZmFsbGJhY2spIHtcblx0aWYoIXNjb3BlIHx8ICFfX3dlYnBhY2tfcmVxdWlyZV9fLm8oc2NvcGUsIGtleSkpIHJldHVybiBmYWxsYmFjaygpO1xuXHRyZXR1cm4gZ2V0U2luZ2xldG9uVmVyc2lvbihzY29wZSwgc2NvcGVOYW1lLCBrZXksIHZlcnNpb24pO1xufSk7XG52YXIgbG9hZFN0cmljdFZlcnNpb25DaGVja0ZhbGxiYWNrID0gLyojX19QVVJFX18qLyBpbml0KGZ1bmN0aW9uKHNjb3BlTmFtZSwgc2NvcGUsIGtleSwgdmVyc2lvbiwgZmFsbGJhY2spIHtcblx0dmFyIGVudHJ5ID0gc2NvcGUgJiYgX193ZWJwYWNrX3JlcXVpcmVfXy5vKHNjb3BlLCBrZXkpICYmIGZpbmRWYWxpZFZlcnNpb24oc2NvcGUsIGtleSwgdmVyc2lvbik7XG5cdHJldHVybiBlbnRyeSA/IGdldChlbnRyeSkgOiBmYWxsYmFjaygpO1xufSk7XG52YXIgbG9hZFN0cmljdFNpbmdsZXRvblZlcnNpb25DaGVja0ZhbGxiYWNrID0gLyojX19QVVJFX18qLyBpbml0KGZ1bmN0aW9uKHNjb3BlTmFtZSwgc2NvcGUsIGtleSwgdmVyc2lvbiwgZmFsbGJhY2spIHtcblx0aWYoIXNjb3BlIHx8ICFfX3dlYnBhY2tfcmVxdWlyZV9fLm8oc2NvcGUsIGtleSkpIHJldHVybiBmYWxsYmFjaygpO1xuXHRyZXR1cm4gZ2V0U3RyaWN0U2luZ2xldG9uVmVyc2lvbihzY29wZSwgc2NvcGVOYW1lLCBrZXksIHZlcnNpb24pO1xufSk7XG52YXIgcmVzb2x2ZUhhbmRsZXIgPSBmdW5jdGlvbihkYXRhKSB7XG5cdHZhciBzdHJpY3QgPSBmYWxzZVxuXHR2YXIgc2luZ2xldG9uID0gZmFsc2Vcblx0dmFyIHZlcnNpb25DaGVjayA9IGZhbHNlXG5cdHZhciBmYWxsYmFjayA9IGZhbHNlXG5cdHZhciBhcmdzID0gW2RhdGEuc2hhcmVTY29wZSwgZGF0YS5zaGFyZUtleV07XG5cdGlmIChkYXRhLnJlcXVpcmVkVmVyc2lvbikge1xuXHRcdGlmIChkYXRhLnN0cmljdFZlcnNpb24pIHN0cmljdCA9IHRydWU7XG5cdFx0aWYgKGRhdGEuc2luZ2xldG9uKSBzaW5nbGV0b24gPSB0cnVlO1xuXHRcdGFyZ3MucHVzaChwYXJzZVJhbmdlKGRhdGEucmVxdWlyZWRWZXJzaW9uKSk7XG5cdFx0dmVyc2lvbkNoZWNrID0gdHJ1ZVxuXHR9IGVsc2UgaWYgKGRhdGEuc2luZ2xldG9uKSBzaW5nbGV0b24gPSB0cnVlO1xuXHRpZiAoZGF0YS5mYWxsYmFjaykge1xuXHRcdGZhbGxiYWNrID0gdHJ1ZTtcblx0XHRhcmdzLnB1c2goZGF0YS5mYWxsYmFjayk7XG5cdH1cblx0aWYgKHN0cmljdCAmJiBzaW5nbGV0b24gJiYgdmVyc2lvbkNoZWNrICYmIGZhbGxiYWNrKSByZXR1cm4gZnVuY3Rpb24oKSB7IHJldHVybiBsb2FkU3RyaWN0U2luZ2xldG9uVmVyc2lvbkNoZWNrRmFsbGJhY2suYXBwbHkobnVsbCwgYXJncyk7IH1cblx0aWYgKHN0cmljdCAmJiB2ZXJzaW9uQ2hlY2sgJiYgZmFsbGJhY2spIHJldHVybiBmdW5jdGlvbigpIHsgcmV0dXJuIGxvYWRTdHJpY3RWZXJzaW9uQ2hlY2tGYWxsYmFjay5hcHBseShudWxsLCBhcmdzKTsgfVxuXHRpZiAoc2luZ2xldG9uICYmIHZlcnNpb25DaGVjayAmJiBmYWxsYmFjaykgcmV0dXJuIGZ1bmN0aW9uKCkgeyByZXR1cm4gbG9hZFNpbmdsZXRvblZlcnNpb25DaGVja0ZhbGxiYWNrLmFwcGx5KG51bGwsIGFyZ3MpOyB9XG5cdGlmIChzdHJpY3QgJiYgc2luZ2xldG9uICYmIHZlcnNpb25DaGVjaykgcmV0dXJuIGZ1bmN0aW9uKCkgeyByZXR1cm4gbG9hZFN0cmljdFNpbmdsZXRvblZlcnNpb25DaGVjay5hcHBseShudWxsLCBhcmdzKTsgfVxuXHRpZiAoc2luZ2xldG9uICYmIGZhbGxiYWNrKSByZXR1cm4gZnVuY3Rpb24oKSB7IHJldHVybiBsb2FkU2luZ2xldG9uRmFsbGJhY2suYXBwbHkobnVsbCwgYXJncyk7IH1cblx0aWYgKHZlcnNpb25DaGVjayAmJiBmYWxsYmFjaykgcmV0dXJuIGZ1bmN0aW9uKCkgeyByZXR1cm4gbG9hZFZlcnNpb25DaGVja0ZhbGxiYWNrLmFwcGx5KG51bGwsIGFyZ3MpOyB9XG5cdGlmIChzdHJpY3QgJiYgdmVyc2lvbkNoZWNrKSByZXR1cm4gZnVuY3Rpb24oKSB7IHJldHVybiBsb2FkU3RyaWN0VmVyc2lvbkNoZWNrLmFwcGx5KG51bGwsIGFyZ3MpOyB9XG5cdGlmIChzaW5nbGV0b24gJiYgdmVyc2lvbkNoZWNrKSByZXR1cm4gZnVuY3Rpb24oKSB7IHJldHVybiBsb2FkU2luZ2xldG9uVmVyc2lvbkNoZWNrLmFwcGx5KG51bGwsIGFyZ3MpOyB9XG5cdGlmIChzaW5nbGV0b24pIHJldHVybiBmdW5jdGlvbigpIHsgcmV0dXJuIGxvYWRTaW5nbGV0b24uYXBwbHkobnVsbCwgYXJncyk7IH1cblx0aWYgKHZlcnNpb25DaGVjaykgcmV0dXJuIGZ1bmN0aW9uKCkgeyByZXR1cm4gbG9hZFZlcnNpb25DaGVjay5hcHBseShudWxsLCBhcmdzKTsgfVxuXHRpZiAoZmFsbGJhY2spIHJldHVybiBmdW5jdGlvbigpIHsgcmV0dXJuIGxvYWRGYWxsYmFjay5hcHBseShudWxsLCBhcmdzKTsgfVxuXHRyZXR1cm4gZnVuY3Rpb24oKSB7IHJldHVybiBsb2FkLmFwcGx5KG51bGwsIGFyZ3MpOyB9XG59O1xudmFyIGluc3RhbGxlZE1vZHVsZXMgPSB7fTtcbiIsIl9fd2VicGFja19yZXF1aXJlX18ucnVpZCA9IFwiYnVuZGxlcj1yc3BhY2tAMS43LjExXCI7Il0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQ0E7O0FBRU87QUFDUDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLFFBQVEsUUFBUTtBQUNoQjtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7O0FDdkJxQztBQUNIOztBQUVsQyxjQUFjLGdDQUFnQztBQUM5QyxjQUFjLCtCQUErQjs7QUFFN0M7QUFDQTtBQUNBLGFBQWEsb0JBQW9CO0FBQ2pDOztBQUVBO0FBQ0E7QUFDQSxxQkFBcUI7QUFDckIsaUJBQWlCO0FBQ2pCOztBQUVBO0FBQ0E7QUFDQSxrQkFBa0I7QUFDbEIsbUJBQW1CO0FBQ25COztBQUVBO0FBQ0EsV0FBVyxTQUFTO0FBQ3BCLFdBQVcsUUFBUTtBQUNuQixhQUFhO0FBQ2I7QUFDQTtBQUNBO0FBQ0E7O0FB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QUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVE7QUFDUjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsWUFBWSxnQ0FBZ0M7QUFDNUM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsUUFBUTtBQUNSO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxJQUFJO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUc7QUFDSDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGtCQUFrQixrQkFBa0I7QUFDcEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEdBQUc7QUFDSDtBQUNBLGtCQUFrQixr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