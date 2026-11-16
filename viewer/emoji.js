/**
 * `:name:` shortcodes in rendered Markdown: a brand icon (bundled SVG, no network) or a standard emoji.
 * A name that is not listed stays as typed.
 */

/** name → [simple-icons file in ./icons, brand color or null for the text color (brands too dark to read on a dark page)]. */
export const ICONS = {
  github: ['github', null],
  gitlab: ['gitlab', '#FC6D26'],
  git: ['git', '#F03C2E'],
  buildkite: ['buildkite', '#14CC80'],
  jira: ['jira', '#0052CC'],
  confluence: ['confluence', null],
  docker: ['docker', '#2496ED'],
  kubernetes: ['kubernetes', '#326CE5'],
  datadog: ['datadog', '#632CA6'],
  cloudflare: ['cloudflare', '#F38020'],
  sentry: ['sentry', null],
  rollbar: ['rollbar', '#3569F3'],
  ruby: ['ruby', '#CC342D'],
  rails: ['rubyonrails', '#D30001'],
  nodejs: ['nodedotjs', '#5FA04E'],
  npm: ['npm', '#CB3837'],
  postgres: ['postgresql', '#4169E1'],
  redis: ['redis', '#FF4438'],
  linear: ['linear', '#5E6AD2'],
  figma: ['figma', '#F24E1E'],
  notion: ['notion', null],
  chrome: ['googlechrome', '#4285F4'],
};

const EMOJI = {
  '+1': '👍', '-1': '👎', thumbsup: '👍', thumbsdown: '👎', white_check_mark: '✅', heavy_check_mark: '✔️', x: '❌',
  warning: '⚠️', no_entry: '⛔', no_entry_sign: '🚫', exclamation: '❗', question: '❓', information_source: 'ℹ️',
  rocket: '🚀', fire: '🔥', sparkles: '✨', tada: '🎉', bug: '🐛', zap: '⚡', boom: '💥', star: '⭐',
  eyes: '👀', pray: '🙏', clap: '👏', wave: '👋', raised_hands: '🙌', muscle: '💪', ok_hand: '👌', point_right: '👉',
  smile: '😄', grin: '😁', joy: '😂', thinking: '🤔', sob: '😭', cry: '😢', sweat_smile: '😅', heart: '❤️',
  100: '💯', bulb: '💡', memo: '📝', book: '📖', books: '📚', link: '🔗', paperclip: '📎', pushpin: '📌',
  bookmark: '🔖', mag: '🔍', lock: '🔒', unlock: '🔓', key: '🔑', shield: '🛡️', gear: '⚙️', wrench: '🔧',
  hammer: '🔨', hammer_and_wrench: '🛠️', package: '📦', truck: '🚚', construction: '🚧', rotating_light: '🚨',
  stopwatch: '⏱️', hourglass: '⌛', alarm_clock: '⏰', calendar: '📅', chart_with_upwards_trend: '📈',
  chart_with_downwards_trend: '📉', bar_chart: '📊', clipboard: '📋', file_folder: '📁', open_file_folder: '📂',
  inbox_tray: '📥', outbox_tray: '📤', email: '📧', speech_balloon: '💬', loudspeaker: '📢', bell: '🔔',
  trophy: '🏆', medal: '🏅', dart: '🎯', puzzle_piece: '🧩', recycle: '♻️', hourglass_flowing_sand: '⏳',
  arrow_right: '➡️', arrow_left: '⬅️', arrow_up: '⬆️', arrow_down: '⬇️', arrows_counterclockwise: '🔄',
  green_circle: '🟢', yellow_circle: '🟡', red_circle: '🔴', large_blue_circle: '🔵', white_circle: '⚪',
  coffee: '☕', beer: '🍺', pizza: '🍕', sunny: '☀️', cloud: '☁️', snowflake: '❄️', globe_with_meridians: '🌐',
  computer: '💻', robot: '🤖', ghost: '👻', skull: '💀', see_no_evil: '🙈', shrug: '🤷', facepalm: '🤦',
};

const SHORTCODE = /:([a-z0-9_+-]+):/g;
const SKIP = 'code, pre, script, style, textarea, .mermaid';

/** `{ char }` for an emoji, `{ file, color }` for a brand icon, null for a name that is not listed. */
export function shortcode(name) {
  if (Object.hasOwn(ICONS, name)) return { file: ICONS[name][0], color: ICONS[name][1] };
  if (Object.hasOwn(EMOJI, name)) return { char: EMOJI[name] };
  return null;
}

function iconEl(name, { file, color }) {
  const el = document.createElement('span');
  el.className = 'emoji-icon';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', name);
  el.title = `:${name}:`;
  el.dataset.shortcode = `:${name}:`; // a copy turns the icon back into this text
  const url = `url("${new URL(`./icons/${file}.svg`, import.meta.url).href}")`;
  el.style.maskImage = url; // CSSOM, so no inline style reaches the sanitizer
  if (color) el.style.backgroundColor = color;
  return el;
}

/** Replace each known `:name:` in the text under `root`, leaving code, pre and diagrams alone. */
export function emojify(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue.includes(':') && !n.parentElement.closest(SKIP)) nodes.push(n);
  }
  for (const node of nodes) {
    const text = node.nodeValue;
    const out = document.createDocumentFragment();
    let last = 0;
    let hit = false;
    for (const m of text.matchAll(SHORTCODE)) {
      const found = shortcode(m[1]);
      if (!found) continue;
      hit = true;
      out.append(text.slice(last, m.index), found.char ?? iconEl(m[1], found));
      last = m.index + m[0].length;
    }
    if (!hit) continue;
    out.append(text.slice(last));
    node.replaceWith(out);
  }
}
