'use strict';

const assert = require('assert');
const data = require('../data/wedding.json');

assert(Array.isArray(data.event.items), 'event.items harus berupa array');
assert(data.event.items.length >= 2, 'event.items harus memiliki event awal');
for (const item of data.event.items) {
  for (const field of ['name', 'time', 'date', 'address', 'mapUrl']) {
    assert.strictEqual(typeof item[field], 'string', `event item harus memiliki ${field}`);
  }
}

console.log('event schema OK');
