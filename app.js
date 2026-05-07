/* === Sternik Motorowodny — quiz/study app === */

(() => {
  'use strict';

  // -------- State --------
  const state = {
    questions: [],
    lang: localStorage.getItem('sm_lang') || 'ru',     // 'ru' or 'pl'
    mode: 'home',                                      // 'home' | 'study' | 'quiz'
    studyIdx: parseInt(localStorage.getItem('sm_study_idx') || '0', 10),
    quizOrder: [],
    quizIdx: 0,
    quizCorrect: 0,
    quizWrong: 0,
    quizAnswered: false,
    bestScore: parseFloat(localStorage.getItem('sm_best') || '0'),
    streak: parseInt(localStorage.getItem('sm_streak') || '0', 10),
  };

  // -------- DOM helpers --------
  const $ = (id) => document.getElementById(id);
  const screens = {
    home: $('screen-home'),
    study: $('screen-study'),
    quiz: $('screen-quiz'),
  };

  // -------- Init --------
  async function init() {
    setLang(state.lang, false);

    try {
      const res = await fetch('questions.json');
      state.questions = await res.json();
    } catch (e) {
      alert('Ошибка загрузки вопросов: ' + e.message);
      return;
    }

    // Stats
    $('stat-total').textContent = state.questions.length;
    $('intro-count').textContent = state.questions.length;
    $('stat-best').textContent = state.bestScore ? Math.round(state.bestScore) + '%' : '—';
    $('stat-streak').textContent = state.streak || '—';

    // Mode selection
    $('btn-study').addEventListener('click', () => goStudy());
    $('btn-quiz').addEventListener('click', () => goQuiz());

    // Language switch
    document.querySelectorAll('#lang-switch .seg__btn').forEach(btn => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang, true));
    });

    // Study controls
    $('study-home').addEventListener('click', goHome);
    $('study-prev').addEventListener('click', () => navStudy(-1));
    $('study-next').addEventListener('click', () => navStudy(+1));

    // Quiz controls
    $('quiz-home').addEventListener('click', goHome);
    $('quiz-skip').addEventListener('click', () => quizAdvance(true));
    $('quiz-next').addEventListener('click', () => quizAdvance(false));

    // Finish overlay
    $('finish-home').addEventListener('click', () => {
      $('finish-overlay').classList.remove('active');
      goHome();
    });
    $('finish-again').addEventListener('click', () => {
      $('finish-overlay').classList.remove('active');
      goQuiz();
    });

    // Keyboard support (desktop)
    document.addEventListener('keydown', onKeyDown);

    // Image viewer close on click
    $('img-viewer').addEventListener('click', closeImageViewer);

    // Service worker for PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {/* ignore */});
    }
  }

  // -------- Screen routing --------
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    state.mode = name;
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  function goHome() { showScreen('home'); }
  function goStudy() {
    showScreen('study');
    renderStudy();
  }
  function goQuiz() {
    state.quizOrder = shuffleIndices(state.questions.length);
    state.quizIdx = 0;
    state.quizCorrect = 0;
    state.quizWrong = 0;
    state.quizAnswered = false;
    showScreen('quiz');
    renderQuiz();
    updateQuizScore();
  }

  function shuffleIndices(n) {
    const arr = Array.from({length: n}, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // -------- Language --------
  function setLang(lang, persist) {
    state.lang = lang;
    document.querySelectorAll('#lang-switch .seg__btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    document.documentElement.lang = lang;
    if (persist) localStorage.setItem('sm_lang', lang);
    // Re-render current screen
    if (state.mode === 'study') renderStudy();
    else if (state.mode === 'quiz') renderQuiz();
  }

  function getQuestionText(q) {
    return (state.lang === 'pl' ? q.pl : q.ru) || q.pl || q.ru;
  }
  function getOptionText(opt) {
    return (state.lang === 'pl' ? opt.pl : opt.ru) || opt.pl || opt.ru;
  }

  // Render question images
  function renderImages(container, images) {
    container.innerHTML = '';
    if (!images || images.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    container.classList.toggle('qimages--multi', images.length > 1);
    images.forEach(filename => {
      const img = document.createElement('img');
      img.src = `images/${filename}`;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('click', () => openImageViewer(img.src));
      container.appendChild(img);
    });
  }

  function openImageViewer(src) {
    const viewer = $('img-viewer');
    $('img-viewer-img').src = src;
    viewer.classList.add('active');
  }
  function closeImageViewer() {
    $('img-viewer').classList.remove('active');
  }

  // -------- Study mode --------
  function renderStudy() {
    const total = state.questions.length;
    if (state.studyIdx < 0) state.studyIdx = 0;
    if (state.studyIdx >= total) state.studyIdx = total - 1;
    localStorage.setItem('sm_study_idx', String(state.studyIdx));

    const q = state.questions[state.studyIdx];

    $('study-qnum').textContent = `№ ${q.number} / ${total}`;
    $('study-qtext').textContent = getQuestionText(q);
    renderImages($('study-images'), q.images);

    const opts = $('study-opts');
    opts.innerHTML = '';
    ['A', 'B', 'C'].forEach(letter => {
      const o = q.options[letter];
      if (!o) return;
      const li = document.createElement('li');
      const btn = document.createElement('div');
      btn.className = 'opt' + (o.correct ? ' is-correct' : '');
      btn.innerHTML = `
        <span class="opt__letter">${letter}</span>
        <span class="opt__text"></span>
        <span class="opt__icon">✓</span>
      `;
      btn.querySelector('.opt__text').textContent = getOptionText(o);
      li.appendChild(btn);
      opts.appendChild(li);
    });

    // Progress
    const pct = ((state.studyIdx + 1) / total) * 100;
    $('study-progress-fill').style.width = pct + '%';
    $('study-progress-text').textContent = `${state.studyIdx + 1} / ${total}`;

    $('study-prev').disabled = state.studyIdx === 0;
    $('study-next').disabled = state.studyIdx === total - 1;
  }

  function navStudy(delta) {
    state.studyIdx += delta;
    renderStudy();
  }

  // -------- Quiz mode --------
  function renderQuiz() {
    if (state.quizIdx >= state.quizOrder.length) {
      finishQuiz();
      return;
    }
    const qIdx = state.quizOrder[state.quizIdx];
    const q = state.questions[qIdx];

    $('quiz-qnum').textContent = `№ ${q.number}`;
    $('quiz-qtext').textContent = getQuestionText(q);
    renderImages($('quiz-images'), q.images);

    const opts = $('quiz-opts');
    opts.innerHTML = '';
    ['A', 'B', 'C'].forEach(letter => {
      const o = q.options[letter];
      if (!o) return;
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt';
      btn.innerHTML = `
        <span class="opt__letter">${letter}</span>
        <span class="opt__text"></span>
        <span class="opt__icon"></span>
      `;
      btn.querySelector('.opt__text').textContent = getOptionText(o);
      btn.addEventListener('click', () => onAnswerSelected(letter, q, btn));
      li.appendChild(btn);
      opts.appendChild(li);
    });

    state.quizAnswered = false;

    // Progress
    const pct = (state.quizIdx / state.quizOrder.length) * 100;
    $('quiz-progress-fill').style.width = pct + '%';
    $('quiz-progress-text').textContent = `${state.quizIdx + 1} / ${state.quizOrder.length}`;

    $('quiz-next').disabled = true;
    $('quiz-skip').disabled = false;
  }

  function onAnswerSelected(letter, q, btn) {
    if (state.quizAnswered) return;
    state.quizAnswered = true;

    const isCorrect = q.options[letter] && q.options[letter].correct;

    // Apply visual feedback to all options
    const optButtons = document.querySelectorAll('#quiz-opts .opt');
    optButtons.forEach(b => {
      const bLetter = b.querySelector('.opt__letter').textContent;
      const opt = q.options[bLetter];
      b.disabled = true;
      if (opt && opt.correct) {
        b.classList.add('is-correct');
        b.querySelector('.opt__icon').textContent = '✓';
      } else if (b === btn && !isCorrect) {
        b.classList.add('is-wrong');
        b.querySelector('.opt__icon').textContent = '✗';
      } else {
        b.classList.add('dimmed');
      }
    });

    if (isCorrect) {
      state.quizCorrect++;
      state.streak++;
    } else {
      state.quizWrong++;
      state.streak = 0;
    }
    localStorage.setItem('sm_streak', String(state.streak));
    updateQuizScore();

    $('quiz-next').disabled = false;
    $('quiz-skip').disabled = true;

    // Light haptic on supported devices
    if (navigator.vibrate) navigator.vibrate(isCorrect ? 30 : [20, 60, 20]);
  }

  function quizAdvance(skip) {
    if (skip && !state.quizAnswered) {
      state.streak = 0;
      localStorage.setItem('sm_streak', String(state.streak));
    }
    state.quizIdx++;
    renderQuiz();
  }

  function updateQuizScore() {
    $('quiz-score').textContent = `${state.quizCorrect} ✓ / ${state.quizWrong} ✗`;
  }

  function finishQuiz() {
    const total = state.quizCorrect + state.quizWrong;
    const pct = total > 0 ? (state.quizCorrect / total) * 100 : 0;

    if (pct > state.bestScore) {
      state.bestScore = pct;
      localStorage.setItem('sm_best', String(pct));
    }
    $('stat-best').textContent = Math.round(state.bestScore) + '%';
    $('stat-streak').textContent = state.streak || '—';

    $('finish-correct').textContent = state.quizCorrect;
    $('finish-wrong').textContent = state.quizWrong;
    $('finish-pct').textContent = Math.round(pct) + '%';
    let emoji = '🎉', title = 'Отлично!', sub = '';
    if (pct >= 90)      { emoji = '🏆'; title = 'Превосходно!'; sub = 'Готовы к экзамену'; }
    else if (pct >= 75) { emoji = '🎉'; title = 'Отличный результат'; sub = 'Ещё немного и идеально'; }
    else if (pct >= 50) { emoji = '👍'; title = 'Неплохо'; sub = 'Стоит ещё повторить'; }
    else                { emoji = '📚'; title = 'Нужно повторить'; sub = 'Попробуйте режим изучения'; }
    $('finish-emoji').textContent = emoji;
    $('finish-title').textContent = title;
    $('finish-sub').textContent = sub;

    $('finish-overlay').classList.add('active');
  }

  // -------- Keyboard --------
  function onKeyDown(e) {
    if (state.mode === 'study') {
      if (e.key === 'ArrowLeft') navStudy(-1);
      if (e.key === 'ArrowRight') navStudy(+1);
    } else if (state.mode === 'quiz') {
      if (!state.quizAnswered) {
        const map = {'1': 'A', 'a': 'A', 'A': 'A', '2': 'B', 'b': 'B', 'B': 'B', '3': 'C', 'c': 'C', 'C': 'C'};
        const letter = map[e.key];
        if (letter) {
          const btn = Array.from(document.querySelectorAll('#quiz-opts .opt')).find(b => b.querySelector('.opt__letter').textContent === letter);
          if (btn) btn.click();
        }
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        quizAdvance(false);
      }
    } else if (state.mode === 'home') {
      if (e.key === '1') goStudy();
      if (e.key === '2') goQuiz();
    }
  }

  // Boot
  init();
})();
