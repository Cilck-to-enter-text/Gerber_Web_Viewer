importScripts('vendor/gerber-to-svg.min.js', 'core.js');
self.onmessage = async ({ data }) => {
  try { self.postMessage({ id: data.id, result: await convertGerber(data.text, data.id) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
