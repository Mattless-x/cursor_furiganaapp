/* ============================================================
   DEAD CHANNEL — site behaviour
   Running timecode, rotating taglines, mobile transport drawer,
   TRACKING / SP-LP controls, reduced-motion guards, entrance glitch.
   Vanilla JS, no dependencies.
   ============================================================ */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Running timecode (fake tape position, not wall clock) ---------- */
  // Counts up from page load at 30 frames/sec. Format: ► HH:MM:SS:FF
  (function timecode() {
    var nodes = document.querySelectorAll(".js-timecode");
    if (!nodes.length) return;

    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function render(totalFrames) {
      var f = totalFrames % 30;
      var totalSeconds = Math.floor(totalFrames / 30);
      var s = totalSeconds % 60;
      var m = Math.floor(totalSeconds / 60) % 60;
      var h = Math.floor(totalSeconds / 3600);
      var text = "► " + pad(h) + ":" + pad(m) + ":" + pad(s) + ":" + pad(f);
      for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;
    }

    if (reduceMotion) {
      // Freeze on a steady "tape paused" value — no ticking motion.
      render(36); // ► 00:00:01:06
      return;
    }

    var start = performance.now();
    function tick(now) {
      render(Math.floor((now - start) / 1000 * 30));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();

  /* ---------- Rotating hero tagline ---------- */
  (function tagline() {
    var el = document.querySelector(".js-tagline");
    if (!el) return;
    var lines = [
      "PLEASE STAND BY — TRANSMISSION RESUMING",
      "THE OWLS ARE NOT WHAT THEY SEEM",
      "RECORDED LATE. PLAYED BACK LATER.",
      "DO NOT ADJUST YOUR SET"
    ];
    var i = 0;
    // Content rotation is informational, not vestibular motion — but we
    // keep a calmer cadence and skip the fade dip under reduced motion.
    setInterval(function () {
      i = (i + 1) % lines.length;
      if (reduceMotion) {
        el.textContent = lines[i];
        return;
      }
      el.style.transition = "opacity 220ms";
      el.style.opacity = "0";
      setTimeout(function () {
        el.textContent = lines[i];
        el.style.opacity = "1";
      }, 240);
    }, 4200);
  })();

  /* ---------- Mobile transport drawer (EJECT) ---------- */
  (function drawer() {
    var btn = document.querySelector(".eject");
    var nav = document.getElementById("primary-nav");
    if (!btn || !nav) return;
    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "EJECT ▼" : "EJECT ▲";
    });
  })();

  /* ---------- Rewind key ---------- */
  (function rewind() {
    var btn = document.querySelector("[data-rewind]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (window.history.length > 1) window.history.back();
      else window.location.href = "index.html";
    });
  })();

  /* ---------- TRACKING slider -> scanline / grain intensity ---------- */
  (function tracking() {
    var slider = document.querySelector(".js-tracking");
    if (!slider) return;
    var root = document.documentElement;
    function apply(v) {
      // v is 0..100. Map to a tasteful 0 .. ~0.10 range.
      var ratio = v / 100;
      root.style.setProperty("--scanline-opacity", (ratio * 0.10).toFixed(3));
      root.style.setProperty("--grain-opacity", (ratio * 0.10).toFixed(3));
    }
    apply(slider.value);
    slider.addEventListener("input", function () { apply(slider.value); });
  })();

  /* ---------- SP / LP toggle (alters effect feel) ---------- */
  (function speed() {
    var btns = document.querySelectorAll(".js-speed");
    if (!btns.length) return;
    var root = document.documentElement;
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (o) { o.classList.remove("is-active"); });
        b.classList.add("is-active");
        // LP = long play = more degraded tape = heavier texture.
        var heavy = b.getAttribute("data-speed") === "lp";
        if (reduceMotion) return;
        root.style.setProperty("--grain-opacity", heavy ? "0.09" : "0.05");
        root.style.setProperty("--scanline-opacity", heavy ? "0.09" : "0.05");
      });
    });
  })();

  /* ---------- Analogue snow / static on <canvas class="snow-canvas"> ---------- */
  // Used by empty states and the 404 "NO SIGNAL" page. Under reduced motion
  // we paint a single still frame instead of animating.
  (function snow() {
    var canvases = document.querySelectorAll(".snow-canvas");
    if (!canvases.length) return;

    canvases.forEach(function (canvas) {
      var ctx = canvas.getContext("2d");
      if (!ctx) return;

      function resize() {
        canvas.width = canvas.clientWidth || canvas.offsetWidth || 320;
        canvas.height = canvas.clientHeight || canvas.offsetHeight || 240;
      }
      function paint() {
        var w = canvas.width, h = canvas.height;
        var img = ctx.createImageData(w, h);
        var d = img.data;
        for (var i = 0; i < d.length; i += 4) {
          var v = (Math.random() * 255) | 0;
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }

      resize();
      paint();
      if (reduceMotion) return; // single still frame, no flashing

      window.addEventListener("resize", function () { resize(); paint(); });
      // ~12fps keeps it lively but well under any flash threshold.
      setInterval(paint, 80);
    });
  })();

  /* ---------- Page-entrance tracking glitch ---------- */
  // A brief bright band sweeps the viewport once on load — the "tape
  // catching tracking" moment. Skipped entirely under reduced motion.
  (function entranceGlitch() {
    if (reduceMotion) return;
    var band = document.createElement("div");
    band.setAttribute("aria-hidden", "true");
    band.style.cssText = [
      "position:fixed", "left:0", "right:0", "height:40px",
      "top:-50px", "z-index:9050", "pointer-events:none",
      "background:linear-gradient(to bottom, rgba(255,255,255,0.18), rgba(200,16,46,0.08), rgba(255,255,255,0))",
      "transition:top 360ms ease-out, opacity 360ms ease-out", "opacity:0.9"
    ].join(";");
    document.body.appendChild(band);
    requestAnimationFrame(function () {
      band.style.top = "110vh";
      band.style.opacity = "0";
    });
    setTimeout(function () { band.remove(); }, 520);
  })();

})();
