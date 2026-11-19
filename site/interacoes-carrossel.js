// Navegação do quiz e reprodução da oração, executadas inteiramente na página.
const main = document.querySelector('main');
const headerTemplate = document.querySelector('#quiz-header');
const lastStep = 10;
const generationStep = 9;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let step = 0;
let busy = false;
let prayer = '';

function setupPrayer(screen) {
  const field = screen.querySelector('textarea');
  const submit = screen.querySelector('[data-prayer-submit]');
  field.addEventListener('input', () => {
    submit.disabled = field.value.trim().split(/\s+/).filter(Boolean).length < 2;
  });
}

function setupAudio(screen) {
  const audio = screen.querySelector('audio');
  const play = screen.querySelector('[aria-label="Tocar oração"]');
  const advance = screen.querySelector('button.botao-3d');
  const seek = screen.querySelector('[data-audio-seek]');
  const bars = seek.querySelectorAll('div > span');
  const thumb = seek.lastElementChild;
  const playClasses = play.className;
  const pauseClasses = 'mr-1 h-5 w-[14px] shrink-0 cursor-pointer border-0 border-l-[5px] border-r-[5px] border-current bg-transparent p-0 text-ink';

  function showPlaying(playing) {
    play.className = playing ? pauseClasses : playClasses;
    play.setAttribute('aria-label', playing ? 'Pausar oração' : 'Tocar oração');
  }

  function updateProgress(progress) {
    seek.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    thumb.style.left = `calc(6.5px + ${progress} * (100% - 13px))`;
    bars.forEach((bar, index) => {
      const played = (index + 0.5) / bars.length <= progress;
      bar.classList.toggle('bg-secondary', played);
      bar.classList.toggle('bg-[#9aa6b2]', !played);
    });
  }

  play.addEventListener('click', async () => {
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      if (audio.ended) audio.currentTime = 0;
      await audio.play();
    } catch {
      showPlaying(false);
    }
  });

  audio.addEventListener('play', () => showPlaying(true));
  audio.addEventListener('pause', () => showPlaying(false));
  audio.addEventListener('timeupdate', () => {
    if (audio.duration && !audio.ended) updateProgress(audio.currentTime / audio.duration);
  });
  audio.addEventListener('ended', () => {
    showPlaying(false);
    updateProgress(0);
    advance.disabled = false;
  });
  audio.addEventListener('error', () => {
    showPlaying(false);
    advance.disabled = false;
  });

  seek.addEventListener('click', event => {
    if (!audio.duration) return;
    const rect = seek.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    audio.currentTime = audio.duration * Math.max(0, Math.min(1, fraction));
  });

  seek.addEventListener('keydown', event => {
    if (!audio.duration || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const seconds = event.key === 'ArrowRight' ? 5 : -5;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
  });
}

function showGeneration(screen) {
  const bar = screen.querySelector('[data-generation-bar]');
  const percent = screen.querySelector('[data-generation-percent]');
  const start = performance.now();
  const duration = 10000;
  function update(now) {
    const elapsed = Math.max(0, Math.min(now - start, duration));
    const progress = (elapsed / duration) * 100;
    bar.style.width = `${progress}%`;
    percent.textContent = `${Math.round(progress)}%`;
    if (elapsed < duration) requestAnimationFrame(update);
    else goTo(lastStep);
  }
  requestAnimationFrame(update);
}

function setupSales(screen) {
  screen.querySelector('[data-prayer-output]').textContent = prayer;
  prayer = '';
  setupTestimonials(screen);
}

function setupTestimonials(screen) {
  const track = screen.querySelector('[data-carousel]');
  const dots = Array.from(screen.querySelector('[data-carousel-dots]').children);
  const last = dots.length - 1;
  let target = null;
  let drag = null;

  function visibleSlide() {
    return Math.max(0, Math.min(last, Math.round(track.scrollLeft / track.clientWidth)));
  }

  function show(index) {
    target = index;
    track.scrollTo({
      left: index * track.clientWidth,
      behavior: reducedMotion.matches ? 'instant' : 'smooth',
    });
  }

  function advance(direction) {
    const index = target ?? visibleSlide();
    show((index + direction + dots.length) % dots.length);
  }

  function updateDots() {
    if (!track.clientWidth) return;
    const index = visibleSlide();
    if (target !== null && Math.abs(track.scrollLeft - target * track.clientWidth) < 2) {
      target = null;
    }

    dots.forEach((dot, position) => {
      if (position === index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  }

  track.addEventListener('scroll', updateDots, { passive: true });
  track.addEventListener('scrollend', () => { target = null; });
  track.addEventListener('touchstart', () => { target = null; }, { passive: true });
  track.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    advance(event.key === 'ArrowRight' ? 1 : -1);
  });

  screen.querySelector('[data-carousel-prev]').addEventListener('click', () => advance(-1));
  screen.querySelector('[data-carousel-next]').addEventListener('click', () => advance(1));
  dots.forEach((dot, index) => dot.addEventListener('click', () => show(index)));

  // Touchscreens keep native horizontal scrolling and momentum.
  track.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    event.preventDefault();
    track.focus({ preventScroll: true });
    track.setPointerCapture(event.pointerId);
    target = null;
    drag = { start: event.clientX, scrollLeft: track.scrollLeft, index: visibleSlide() };
    track.dataset.dragging = '';
  });

  track.addEventListener('pointermove', event => {
    if (!drag) return;
    track.scrollLeft = drag.scrollLeft - (event.clientX - drag.start);
  });

  function finishDrag(event) {
    if (!drag) return;
    const distance = event.type === 'pointerup' ? event.clientX - drag.start : 0;
    const index = Math.abs(distance) >= 35 ? drag.index - Math.sign(distance) : visibleSlide();
    drag = null;
    delete track.dataset.dragging;
    show(Math.max(0, Math.min(last, index)));
  }

  track.addEventListener('pointerup', finishDrag);
  track.addEventListener('lostpointercapture', finishDrag);
}

function goTo(next) {
  const template = document.querySelector(`#step-${next}`);
  const screen = template.content.firstElementChild.cloneNode(true);
  screen.dataset.step = String(next);

  const previous = main.querySelector('[data-step]');
  previous.querySelector('audio')?.pause();
  previous.replaceWith(screen);

  const header = main.querySelector('[data-quiz-header]');
  if (next < generationStep) {
    let progress = header?.querySelector('[data-quiz-progress]');
    if (!header) {
      const freshHeader = headerTemplate.content.firstElementChild.cloneNode(true);
      freshHeader.dataset.quizHeader = '';
      main.prepend(freshHeader);
      progress = freshHeader.querySelector('[data-quiz-progress]');
    }
    progress.style.width = `${Math.round((next / generationStep) * 100)}%`;
  } else {
    header?.remove();
  }

  step = next;
  busy = false;
  if (step === 6) setupPrayer(screen);
  if (step === 7) setupAudio(screen);
  if (step === generationStep) showGeneration(screen);
  if (step === lastStep) setupSales(screen);

  const title = screen.querySelector('h1');
  if (title) {
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}

main.addEventListener('click', event => {
  const button = event.target.closest('button');
  const screen = button?.closest('[data-step]');
  if (!screen || busy || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
  if (step >= generationStep || (step === 7 && !button.matches('.botao-3d'))) return;

  if (button.matches('.quiz-option')) {
    busy = true;
    button.classList.add('selected');
    window.setTimeout(() => goTo(step + 1), 180);
    return;
  }
  if (step === 6 && button.matches('[data-prayer-submit]')) {
    prayer = screen.querySelector('textarea').value.trim();
  }
  goTo(step + 1);
});
