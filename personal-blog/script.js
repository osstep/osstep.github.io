const posts = [
  {
    title: 'Вечерняя прогулка по Казани',
    tag: 'татарстан',
    date: 'Недавно',
    text: 'Тёплый огонь фонарей, отражения в реке, вид на Кремль и ощущение, что город живёт своей особой, спокойной жизнью. Такие прогулки заряжают лучше любого кофе.',
  },
  {
    title: 'Уютный заход в Perfect World после дня',
    tag: 'perfect world',
    date: 'После работы',
    text: 'Заходишь в игру, включаешь спокойную музыку, отправляешься выполнять несколько квестов и любоваться видами локаций. Без спешки, без гонки — просто отдых.',
  },
  {
    title: 'Мысли о путешествиях по Татарстану',
    tag: 'татарстан',
    date: 'Планы',
    text: 'Хочется выбраться в небольшие города и сёла Татарстана, попробовать домашнюю кухню, узнать местные истории и почувствовать, как живёт регион вне больших туристических маршрутов.',
  },
  {
    title: 'Небольшое достижение в PW',
    tag: 'perfect world',
    date: 'Игровые новости',
    text: 'Закрыл давно отложенный данж и наконец-то добрал редкий предмет. Не ради соревновательности, а ради приятного чувства завершённости.',
  },
];

function renderPosts() {
  const container = document.getElementById('postsContainer');
  if (!container) return;

  container.innerHTML = '';

  posts.forEach((post) => {
    const el = document.createElement('article');
    el.className = 'post';

    el.innerHTML = `
            <div class="post-tag">${post.tag}</div>
            <h3 class="post-title">${post.title}</h3>
            <div class="post-meta">${post.date}</div>
            <p class="post-text">${post.text}</p>
        `;

    container.appendChild(el);
  });
}

function setupNavToggle() {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');

  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    nav.classList.toggle('open');
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  renderPosts();
  setupNavToggle();
});
