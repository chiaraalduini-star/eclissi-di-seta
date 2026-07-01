/*
  Fumo rosso cinematico — sfondo decorativo in WebGL.
  Single full-screen quad, fragment shader con fbm (simplex noise),
  movimento lento verso l'alto + leggero swirl, dissolvenza ai bordi.
  Se WebGL non è disponibile o l'utente preferisce ridurre le animazioni,
  resta visibile il fallback CSS statico/animato (#smoke-fallback) già
  presente nell'HTML: questo script si limita a non attivarsi.
*/
(function () {
  'use strict';

  var canvas = document.getElementById('smoke-bg');
  var fallback = document.getElementById('smoke-fallback');
  if (!canvas) return;

  // rispetta le preferenze di accessibilità: niente WebGL animato, resta il fallback
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var gl =
    canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false }) ||
    canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) return; // niente WebGL: il fallback CSS resta visibile

  var VERT_SRC =
    'attribute vec2 a_position;' +
    'void main(){' +
    '  gl_Position = vec4(a_position, 0.0, 1.0);' +
    '}';

  // simplex noise 2D (Ashima Arts) + fbm a 5 ottave, per un fumo organico e leggero
  var FRAG_SRC =
    'precision mediump float;' +
    'uniform vec2 u_resolution;' +
    'uniform float u_time;' +
    'vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }' +
    'vec2 mod289(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }' +
    'vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }' +
    'float snoise(vec2 v){' +
    '  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);' +
    '  vec2 i  = floor(v + dot(v, C.yy));' +
    '  vec2 x0 = v - i + dot(i, C.xx);' +
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);' +
    '  vec4 x12 = x0.xyxy + C.xxzz;' +
    '  x12.xy -= i1;' +
    '  i = mod289(i);' +
    '  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));' +
    '  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);' +
    '  m = m*m; m = m*m;' +
    '  vec3 x = 2.0 * fract(p * C.www) - 1.0;' +
    '  vec3 h = abs(x) - 0.5;' +
    '  vec3 ox = floor(x + 0.5);' +
    '  vec3 a0 = x - ox;' +
    '  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);' +
    '  vec3 g;' +
    '  g.x = a0.x * x0.x + h.x * x0.y;' +
    '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;' +
    '  return 130.0 * dot(m, g);' +
    '}' +
    'float fbm(vec2 p){' +
    '  float value = 0.0;' +
    '  float amp = 0.5;' +
    '  for(int i = 0; i < 5; i++){' +
    '    value += amp * snoise(p);' +
    '    p *= 2.02;' +
    '    amp *= 0.5;' +
    '  }' +
    '  return value;' +
    '}' +
    'void main(){' +
    '  vec2 uv = gl_FragCoord.xy / u_resolution.xy;' +
    '  vec2 aspectUv = uv;' +
    '  aspectUv.x *= u_resolution.x / u_resolution.y;' +
    '  float t = u_time * 0.035;' + // velocità di risalita: molto lenta
    '  vec2 p = aspectUv * 1.6;' +
    '  float swirl = sin(p.x * 1.3 + t * 2.0) * 0.12 + cos(p.y * 1.1 - t * 1.6) * 0.12;' +
    '  p.x += swirl;' +
    '  p.y -= t * 2.2;' + // il fumo sale
    '  float n = fbm(p);' +
    '  n = fbm(p + n * 0.4);' + // domain warp: fumo più organico
    '  vec2 c = uv - 0.5;' +
    '  float vignette = 1.0 - smoothstep(0.25, 0.62, length(c));' + // dissolvenza ai bordi
    '  float alpha = clamp(n * 0.5 + 0.15, 0.0, 1.0) * vignette;' +
    '  alpha *= 0.75;' + // intensità alzata su richiesta esplicita: effetto molto più marcato
    '  vec3 smokeColor = vec3(0.227, 0.102, 0.106);' + // granato scuro desaturato
    '  gl_FragColor = vec4(smokeColor, alpha);' +
    '}';

  function compileShader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('smoke-bg: errore compilazione shader —', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  var vs = compileShader(gl.VERTEX_SHADER, VERT_SRC);
  var fs = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return;

  var program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('smoke-bg: errore link programma —', gl.getProgramInfoLog(program));
    return;
  }
  gl.useProgram(program);

  // full-screen quad singolo (triangle strip, 4 vertici)
  var quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  var posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  var uTime = gl.getUniformLocation(program, 'u_time');
  var uRes = gl.getUniformLocation(program, 'u_resolution');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.floor(window.innerWidth * dpr);
    var h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  // WebGL pronto: mostra il canvas, nasconde il fallback CSS
  canvas.classList.add('active');
  if (fallback) fallback.classList.add('hidden');

  var start = performance.now();
  function render(now) {
    var t = (now - start) / 1000;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uTime, t);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
