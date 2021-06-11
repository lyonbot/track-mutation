/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/ban-types */

interface ProxyState {
  key: string;
  parentProxy?: any;
  children: Record<string, { value: any; proxy: any }>;
}

export type MutationType = "set" | "delete" | "arrayMutation";
export type MutationListener = (
  type: MutationType,
  pathParts: string[],
  valueOrMutationInfo: any
) => any;

const FLAGS_ONCE = 1;

const arrayMutatingMethods: Record<string, boolean> = {
  pop: true,
  push: true,
  shift: true,
  unshift: true,
  splice: true,
};

export function createTrackingProxy<T>(obj: T) {
  let proxyState = new WeakMap<any, ProxyState>();
  let tempMuted = false;
  const listeners = new Map<MutationListener, number>();

  /**
   *
   * @param fn
   * @param once 可选，只触发一次。-- 注意：如果回调函数返回了 false 则下一次发生修改还是会触发
   */
  function addListener(fn: MutationListener, once?: boolean) {
    /* istanbul ignore next */
    if (typeof fn !== "function") return;
    listeners.set(fn, +!!once * FLAGS_ONCE);
  }

  function removeListener(fn: MutationListener) {
    listeners.delete(fn);
  }

  function markProxyDiscarded(proxy: any) {
    /* istanbul ignore next */
    if (!proxy) return;

    const lastState = proxyState.get(proxy);
    if (lastState) {
      // eslint-disable-next-line no-restricted-syntax
      for (const key in lastState.children) {
        markProxyDiscarded(lastState.children[key]!.proxy);
      }
    }

    proxyState.delete(proxy);
  }

  function emitChangeFromProxy(
    objectProxy: any,
    type: MutationType,
    key: any,
    value: any
  ) {
    if (typeof key !== "string" && key !== void 0) return;
    if (tempMuted) return;

    const state = proxyState.get(objectProxy)!;
    if (!state) return; //  这个 proxy 已经无效了

    {
      // 标记原来的 children 无效化
      const lastChild = state.children[key];
      if (lastChild) {
        delete state.children[key];
        markProxyDiscarded(lastChild.proxy);
      }
    }

    let pathParts = key === void 0 ? [] : [key];
    {
      // 构造 pathParts
      let ptr = proxyState.get(objectProxy);
      while (ptr) {
        pathParts.push(ptr.key);
        ptr = proxyState.get(ptr.parentProxy);
      }
      pathParts = pathParts.reverse().slice(2); // 反转，然后去掉第一个（总是空的）和第二个（总是 "obj"）
    }

    // ---------------------

    listeners.forEach((flags, fn) => {
      const ans = fn(type, pathParts, value);
      if (flags & FLAGS_ONCE && ans !== false) removeListener(fn);
    });
  }

  const createProxy = <T extends object>(
    value: T,
    opt: Pick<ProxyState, "parentProxy" | "key">
  ) => {
    const proxy = new Proxy(value, {
      get(target, key, receiver) {
        const rawValue = Reflect.get(target, key, receiver);
        if (rawValue === null || typeof key === "symbol") return rawValue;

        if (typeof rawValue === "object") {
          const state = proxyState.get(proxy);
          if (!state) return rawValue; // 这个 Proxy 指向的对象引用已经被抛弃了，不再需要为子字段包装 proxy

          if (state.children[key]?.value === rawValue)
            return state.children[key]!.proxy; // 子字段被访问过，而且没变引用

          // 这个 property 未被访问过，或者访问过但是值变了，总之需要创建新的 Proxy
          const lastProxy = state.children[key]?.proxy;
          /* istanbul ignore else */
          if (lastProxy) markProxyDiscarded(lastProxy);

          // 然后创建一个新的 proxy
          const subProxy = createProxy(rawValue, { key, parentProxy: proxy });
          state.children[key] = {
            proxy: subProxy,
            value: rawValue,
          };
          return subProxy;
        }

        if (typeof rawValue === "function" && key in arrayMutatingMethods) {
          return function (this: any[], ...args: any[]) {
            let success = false;
            try {
              tempMuted = true;
              // eslint-disable-next-line prefer-spread
              const ans = target[key].apply(target, args);
              success = true;
              return ans;
            } finally {
              tempMuted = false;
              if (success)
                emitChangeFromProxy(proxy, "arrayMutation", undefined, [
                  key,
                  ...args,
                ]);
            }
          };
        }

        return rawValue;
      },
      set(target, key, value, receiver) {
        const success = Reflect.set(target, key, value, receiver);
        if (!success) return false;

        emitChangeFromProxy(proxy, "set", key, value);
        return true;
      },
      deleteProperty(target, key) {
        const success = Reflect.deleteProperty(target, key);
        if (!success) return false;

        emitChangeFromProxy(proxy, "delete", key, undefined);
        return success;
      },
    });
    proxyState.set(proxy, { ...opt, children: {} });
    return proxy;
  };

  const root = createProxy({ obj }, { key: "" });

  return {
    proxy: root.obj,
    addListener,
    removeListener,
    teardown() {
      proxyState = new WeakMap<any, ProxyState>();
      listeners.clear();
    },
  };
}

export default createTrackingProxy;
