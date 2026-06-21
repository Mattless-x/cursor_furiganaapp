/* ============================================================
   DEAD CHANNEL — photo gallery lightbox
   Click a contact-sheet frame to project it. Keyboard: ← → Esc.
   Vanilla JS, no dependencies.
   ============================================================ */
(function () {
  "use strict";

  var frames = Array.prototype.slice.call(document.querySelectorAll(".frame"));
  var box = document.getElementById("lightbox");
  if (!frames.length || !box) return;

  var imgEl = document.getElementById("lb-image");
  var capEl = document.getElementById("lb-caption");
  var exifEl = document.getElementById("lb-exif");
  var btnClose = box.querySelector(".lb-close");
  var btnPrev = box.querySelector(".lb-prev");
  var btnNext = box.querySelector(".lb-next");

  var current = 0;
  var lastFocused = null;

  function dataFor(frame) {
    var img = frame.querySelector("img");
    return {
      full: frame.getAttribute("data-full"),
      caption: frame.getAttribute("data-caption") || "",
      exif: frame.getAttribute("data-exif") || "",
      alt: img ? img.getAttribute("alt") : ""
    };
  }

  function show(index) {
    current = (index + frames.length) % frames.length;
    var d = dataFor(frames[current]);
    imgEl.src = d.full;
    imgEl.alt = d.alt;
    capEl.textContent = d.caption + "  ·  FRAME " + (current + 1) + "/" + frames.length;
    exifEl.textContent = d.exif;
  }

  function open(index) {
    lastFocused = document.activeElement;
    show(index);
    box.classList.add("is-open");
    document.body.style.overflow = "hidden";
    btnClose.focus();
    document.addEventListener("keydown", onKey);
  }

  function close() {
    box.classList.remove("is-open");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") show(current - 1);
    else if (e.key === "ArrowRight") show(current + 1);
    else if (e.key === "Tab") {
      // Simple focus trap across the four controls.
      var f = [btnClose, btnPrev, btnNext];
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey) { e.preventDefault(); f[(i <= 0 ? f.length - 1 : i - 1)].focus(); }
      else { e.preventDefault(); f[(i === f.length - 1 ? 0 : i + 1)].focus(); }
    }
  }

  frames.forEach(function (frame, i) {
    frame.addEventListener("click", function () { open(i); });
  });

  btnClose.addEventListener("click", close);
  btnPrev.addEventListener("click", function () { show(current - 1); });
  btnNext.addEventListener("click", function () { show(current + 1); });
  box.addEventListener("click", function (e) {
    // Click the black backdrop (not the image or a button) to close.
    if (e.target === box) close();
  });

})();
