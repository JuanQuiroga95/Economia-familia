const fetch = require('node:fetch');
async function test() {
  const res = await fetch('https://dolarhoy.com/cotizacion-euro-blue');
  const text = await res.text();
  console.log(text.substring(0, 1000));
}
test();
