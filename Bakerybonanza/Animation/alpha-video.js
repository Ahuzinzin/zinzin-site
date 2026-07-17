/**
 * alpha-video.js
 * Cross-browser transparent video player (Chrome + Safari + iOS Safari).
 *
 * WHY THIS EXISTS
 * ----------------
 * WebM/VP9 alpha transparency is only honored by Chromium-based browsers.
 * Safari decodes the WebM but ignores the alpha channel entirely, so it
 * paints a solid black rectangle where the transparent parts should be.
 * Safari's own alpha-capable codec (HEVC+Alpha in a .mov) is Apple-only
 * and needs Mac encoding tools (Compressor / AVFoundation) to produce
 * efficiently — plain ffmpeg on Linux/Windows can't make a real
 * HEVC-with-alpha file.
 *
 * This player sidesteps codec alpha support completely. It expects a
 * normal H.264 MP4 that is double-height: the TOP half of every frame is
 * the RGB color image, the BOTTOM half is a white-on-black alpha mask.
 * That "stacked" MP4 plays identically (and decodes with hardware
 * acceleration) in every modern browser, and this script recombines the
 * two halves into a real RGBA image on a <canvas> using WebGL, every frame.
 *
 * HOW TO MAKE THE STACKED MP4 (already done for your idle/touch clips —
 * idle_stacked.mp4 / touch_stacked.mp4 in the Animation folder):
 *   ffmpeg -i color_with_alpha.mov -filter_complex \
 *     "[0:v]format=yuva420p,split=2[c][a]; \
 *      [c]format=yuv420p[color]; \
 *      [a]alphaextract,format=gray[alpha]; \
 *      [color][alpha]vstack=inputs=2" \
 *     -c:v libx264 -pix_fmt yuv420p -crf 18 stacked.mp4
 *
 * USAGE
 * -----
 *   <canvas id="idleCanvas" width="704" height="1248"></canvas>
 *   <script type="module">
 *     import { AlphaVideo } from './alpha-video.js';
 *
 *     const idle = new AlphaVideo(document.getElementById('idleCanvas'), {
 *       src: '/Bakerybonanza/Animation/idle_stacked.mp4',
 *       loop: true,
 *       autoplay: true,
 *     });
 *
 *     const touch = new AlphaVideo(document.getElementById('touchCanvas'), {
 *       src: '/Bakerybonanza/Animation/touch_stacked.mp4',
 *       loop: false,
 *       autoplay: false,
 *       onEnded: () => { touchCanvasEl.style.display = 'none'; idleCanvasEl.style.display = ''; },
 *     });
 *
 *     characterEl.addEventListener('click', () => {
 *       idleCanvasEl.style.display = 'none';
 *       touchCanvasEl.style.display = '';
 *       touch.play(true); // true = restart from frame 0
 *     });
 *   </script>
 */

const VERTEX_SRC = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    v_uv.y = 1.0 - v_uv.y;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

// Samples the top half of the source texture for RGB, the bottom half
// (as luminance) for alpha, and writes a premultiplied-friendly RGBA pixel.
const FRAGMENT_SRC = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  void main() {
    vec2 colorUv = vec2(v_uv.x, v_uv.y * 0.5);
    vec2 alphaUv = vec2(v_uv.x, v_uv.y * 0.5 + 0.5);
    vec3 color = texture2D(u_tex, colorUv).rgb;
    float alpha = texture2D(u_tex, alphaUv).r;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

function compileShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile error: ' + info);
  }
  return shader;
}

export class AlphaVideo {
  /**
   * @param {HTMLCanvasElement} canvas - visible canvas, sized to HALF the
   *   stacked video's height (i.e. the size of one frame's color half).
   * @param {Object} opts
   * @param {string} opts.src - URL of the stacked (color-over-alpha) MP4.
   * @param {boolean} [opts.loop=true]
   * @param {boolean} [opts.autoplay=true]
   * @param {boolean} [opts.muted=true]
   * @param {Function} [opts.onEnded] - called when a non-looping clip finishes.
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.opts = Object.assign({ loop: true, autoplay: true, muted: true }, opts);
    this.onEnded = opts.onEnded;

    this.video = document.createElement('video');
    this.video.src = this.opts.src;
    this.video.loop = this.opts.loop;
    this.video.muted = this.opts.muted;
    this.video.playsInline = true;
    this.video.autoplay = false; // we drive playback ourselves
    // NOT display:none — Safari throttles display:none <video> elements to a
    // reduced internal decode resolution (it assumes nothing needs the pixels),
    // which shows up as a blocky/pixelated texture once sampled into WebGL.
    // Keeping it in the render tree at 1x1 with opacity 0 keeps full-res decode.
    this.video.style.position = 'fixed';
    this.video.style.top = '0';
    this.video.style.left = '0';
    this.video.style.width = '1px';
    this.video.style.height = '1px';
    this.video.style.opacity = '0';
    this.video.style.pointerEvents = 'none';
    document.body.appendChild(this.video);

    if (!this.opts.loop) {
      this.video.addEventListener('ended', () => {
        this._rafId && cancelAnimationFrame(this._rafId);
        if (this.onEnded) this.onEnded();
      });
    }

    this._initGL();

    this.video.addEventListener('loadeddata', () => {
      if (this.opts.autoplay) this.play();
    }, { once: true });
  }

  _initGL() {
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
    if (!gl) throw new Error('WebGL not available');
    this.gl = gl;

    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);
    this.program = program;

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  _renderFrame() {
    const { gl, video, texture } = this;
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    this._rafId = requestAnimationFrame(() => this._renderFrame());
  }

  /** @param {boolean} [restart] - restart from frame 0 before playing. */
  play(restart = false) {
    if (restart) this.video.currentTime = 0;
    this.video.play();
    this._rafId && cancelAnimationFrame(this._rafId);
    this._renderFrame();
  }

  pause() {
    this.video.pause();
    this._rafId && cancelAnimationFrame(this._rafId);
  }

  destroy() {
    this.pause();
    this.video.remove();
  }
}
