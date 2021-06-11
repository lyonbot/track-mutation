# track-mutation

Track object mutations with ES6 Proxy. Simple and tested.

[![npm](https://img.shields.io/npm/v/track-mutation)](https://www.npmjs.com/package/track-mutation)

## Usage

```js
import { createTrackingProxy } from 'track-mutation';

const data = {
  foo: 'hello',
  bar: [1, 2, 3, 4],
  baz: {
    name: 'xxx',
    age: 1234,
  },
}

const controller = createTrackingProxy(data)
const proxy = controller.proxy

controller.addListener((type, path, value) => {
  console.log(type, path, value)
})

proxy.baz.name = 'yyy'    // => Console Output: set, ['baz', 'name'], 'yyy'
proxy.bar.push(5)         // => Console Output: arrayMutation, ['bar'], ['push', 5]
delete proxy.foo          // => Console Output: delete, ['foo'], undefined

// Note: all changes will apply to `data` the original object

// To stop observing changes, call this

controller.teardown()
```
