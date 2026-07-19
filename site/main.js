import projectIcon from '../public/project-icon.svg?url';
import chartShot from '../image/image-3.png?url';
import profileShot from '../image/image-2.png?url';

document.querySelectorAll('[data-project-icon]').forEach((image) => { image.src = projectIcon; });
document.querySelector('[data-project-icon-link]').href = projectIcon;
document.querySelector('[data-chart-shot]').src = chartShot;
document.querySelector('[data-profile-shot]').src = profileShot;

const root = document.documentElement;
const themeButton = document.querySelector('.theme-button');
const media = window.matchMedia('(prefers-color-scheme: dark)');
const storedTheme = localStorage.getItem('meteor-pages-theme');

function setTheme(theme) {
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#11110f' : '#f8f4ea';
  themeButton.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
}

setTheme(storedTheme || (media.matches ? 'dark' : 'light'));
themeButton.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('meteor-pages-theme', next);
  setTheme(next);
});
media.addEventListener('change', (event) => {
  if (!localStorage.getItem('meteor-pages-theme')) setTheme(event.matches ? 'dark' : 'light');
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px' });

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
