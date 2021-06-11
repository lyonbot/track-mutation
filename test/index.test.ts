import { createTrackingProxy } from '../src/index';

describe('src/index', () => {
  describe('createTrackingProxy', () => {
    test('set, delete, once, teardown', () => {
      const callback = jest.fn();
      const once1 = jest.fn().mockReturnValue(false);
      const once2 = jest.fn();

      const raw = { foo: { bar: 123 }, baz: 456 };
      const p = createTrackingProxy(raw);
      const obj = p.proxy;

      p.addListener(callback);
      p.addListener(once1, true);
      p.addListener(once2, true);

      obj.foo.bar = 999;
      delete obj.baz;

      p.teardown();
      obj.foo.bar = 888;

      expect('baz' in raw).toBeFalsy();
      expect(raw.foo.bar).toBe(888);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(once1).toHaveBeenCalledTimes(2);
      expect(once2).toHaveBeenCalledTimes(1);

      expect(callback.mock.calls[0]).toEqual(['set', ['foo', 'bar'], 999]);
      expect(callback.mock.calls[1]).toEqual(['delete', ['baz'], undefined]);
    });

    test('arrayMutation', () => {
      const callback = jest.fn();
      const p = createTrackingProxy({ foo: [{ x: 1 }, { x: 2 }] });
      const data = p.proxy;
      p.addListener(callback);

      callback.mockClear();
      const shifted = data.foo.shift();
      expect(callback).toBeCalledTimes(1);
      expect(callback.mock.calls[0]).toEqual(['arrayMutation', ['foo'], ['shift']]);

      callback.mockClear();
      data.foo.push({ x: 3 });
      expect(callback).toBeCalledTimes(1);
      expect(callback.mock.calls[0]).toEqual(['arrayMutation', ['foo'], ['push', { x: 3 }]]);

      callback.mockClear();
      data.foo[0].y = 9;
      expect(callback).toBeCalledTimes(1);
      expect(callback.mock.calls[0]).toEqual(['set', ['foo', '0', 'y'], 9]);

      callback.mockClear();
      shifted.x = 9999;
      expect(callback).not.toBeCalled();

      expect(data).toEqual({ foo: [{ x: 2, y: 9 }, { x: 3 }] });
    });

    test('ref change on child', () => {
      const callback = jest.fn();
      const p = createTrackingProxy({ foo: { bar: 1234 } });
      const data = p.proxy;

      p.addListener(callback);
      const oldFoo = data.foo;
      data.foo = { bar: 999 };
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0]).toEqual(['set', ['foo'], { bar: 999 }]);

      callback.mockClear();
      oldFoo.bar = 2333;         // 这个不会触发修改，因为foo已经被换掉引用了
      expect(callback).not.toHaveBeenCalled();

      callback.mockClear();
      data.foo.bar = 1111111;
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0]).toEqual(['set', ['foo', 'bar'], 1111111]);

      expect(data).toEqual({ foo: { bar: 1111111 } });
    });
  });
});
