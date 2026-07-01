async function test() {
  const res = await fetch('https://api.bluelytics.com.ar/v2/latest');
  const json = await res.json();
  console.log(json);
}
test();
