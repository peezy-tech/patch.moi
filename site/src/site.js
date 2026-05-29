const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.18 },
);

document.querySelectorAll("[data-reveal]").forEach((node) => revealObserver.observe(node));

const terminal = document.querySelector(".terminal-visual");

window.addEventListener(
  "scroll",
  () => {
    if (!terminal || reduceMotion) {
      return;
    }

    const lift = Math.max(-22, window.scrollY * -0.035);
    terminal.style.setProperty("--scroll-lift", `${lift}px`);
  },
  { passive: true },
);

const canvas = document.getElementById("patch-canvas");
const context = canvas?.getContext("2d");

if (canvas && context) {
  let width = 0;
  let height = 0;
  let frame = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.offsetWidth;
    height = canvas.offsetHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const drawThread = (seed, color, yOffset) => {
    const startX = width * (0.15 + seed * 0.08);
    const startY = height * (0.2 + yOffset);
    const drift = reduceMotion ? 0 : Math.sin(frame * 0.012 + seed) * 14;

    context.beginPath();
    context.moveTo(startX, startY);
    context.bezierCurveTo(
      width * 0.36,
      startY + 88 + drift,
      width * 0.54,
      startY - 54,
      width * 0.82,
      startY + 56 + drift,
    );
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();

    for (let index = 0; index < 5; index += 1) {
      const x = startX + index * ((width * 0.62) / 4);
      const y = startY + Math.sin(index + seed + frame * 0.01) * 16 + drift * 0.35;
      context.fillStyle = color;
      context.fillRect(x, y, 42, 3);
    }
  };

  const render = () => {
    context.clearRect(0, 0, width, height);
    context.globalAlpha = 0.72;
    drawThread(1, "#83ded3", 0.02);
    drawThread(2, "#ef9b90", 0.18);
    drawThread(3, "#e4bd73", 0.34);
    context.globalAlpha = 1;
    frame += 1;

    if (!reduceMotion) {
      window.requestAnimationFrame(render);
    }
  };

  resize();
  render();
  window.addEventListener("resize", resize);
}
