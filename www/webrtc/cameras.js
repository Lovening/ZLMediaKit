const cameras = [
  { title: '大华相机 01', app: 'live', stream: 'dahua01' },
  { title: '大华相机 02', app: 'live', stream: 'dahua02' },
];

const container = document.querySelector('#cameras');
const template = document.querySelector('#camera-card');
const stopPlayers = [];
const settings = document.querySelector('#server-settings');
const address = document.querySelector('#zlm-address');
const serverStatus = document.querySelector('#server-status');
const addressKey = 'camera-monitor.zlm-origin';
let serverOrigin = location.origin === 'null' ? '' : location.origin;
try {
  serverOrigin = localStorage.getItem(addressKey) || serverOrigin;
} catch {
  // Playback can still work when browser storage is disabled.
}
address.value = serverOrigin;

function applyAddress() {
  let url;
  try {
    url = new URL(address.value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid server origin');
  } catch {
    serverStatus.textContent = '请输入 ZLM 的 HTTP(S) 地址，例如 http://192.168.1.100:8080';
    address.focus();
    return false;
  }
  if (location.protocol === 'https:' && url.protocol === 'http:') {
    serverStatus.textContent = 'HTTPS 页面需要 HTTPS 的 ZLM 地址';
    address.focus();
    return false;
  }
  if (url.origin !== serverOrigin) {
    for (const stop of stopPlayers) stop();
    serverOrigin = url.origin;
  }
  address.value = serverOrigin;
  try {
    localStorage.setItem(addressKey, serverOrigin);
  } catch {
    // Keep using the address for this page.
  }
  serverStatus.textContent = '已应用';
  return true;
}

settings.addEventListener('submit', (event) => {
  event.preventDefault();
  applyAddress();
});

for (const { title, app, stream } of cameras) {
  const card = template.content.cloneNode(true);
  const video = card.querySelector('video');
  const status = card.querySelector('output');
  const button = card.querySelector('button');
  card.querySelector('h2').textContent = title;
  card.querySelector('code').textContent = `${app}/${stream}`;
  video.setAttribute('aria-label', title);
  button.setAttribute('aria-label', `播放 ${title}`);

  let player;

  function stop(message = '已停止') {
    const active = player;
    player = undefined;
    active?.close();
    video.srcObject = null;
    status.textContent = message;
    button.textContent = '播放';
    button.setAttribute('aria-label', `播放 ${title}`);
  }

  button.addEventListener('click', () => {
    if (player) {
      stop();
      return;
    }
    if (!applyAddress()) return;

    const url = new URL('/index/api/webrtc', serverOrigin);
    url.search = new URLSearchParams({ app, stream, type: 'play' });
    status.textContent = '正在连接…';
    try {
      const client = window.ZLMRTCClient;
      if (!client?.Endpoint) {
        stop('播放器脚本加载失败');
        return;
      }
      const active = new client.Endpoint({
        element: video,
        zlmsdpUrl: url.href,
        recvOnly: true,
        useCamera: false,
        videoEnable: true,
        audioEnable: false,
        usedatachannel: false,
      });
      player = active;
      button.textContent = '停止';
      button.setAttribute('aria-label', `停止 ${title}`);

      active.on(client.Events.WEBRTC_ON_REMOTE_STREAMS, () => {
        if (player === active) status.textContent = '已收到视频';
      });
      active.on(client.Events.WEBRTC_OFFER_ANWSER_EXCHANGE_FAILED, (error) => {
        if (player !== active) return;
        console.warn(`播放协商失败 ${app}/${stream}`, error);
        stop('协商失败，请检查 ZLM 中的相机流');
      });
      active.on(client.Events.WEBRTC_ON_CONNECTION_STATE_CHANGE, (state) => {
        if (player !== active) return;
        if (state === 'failed') stop('连接失败，请检查 WebRTC 媒体端口');
        if (state === 'disconnected') status.textContent = '连接中断，等待恢复…';
        if (state === 'connected') status.textContent = '已连接';
      });
    } catch (error) {
      console.warn(`播放器初始化失败 ${app}/${stream}`, error);
      stop('播放器初始化失败');
    }
  });

  video.addEventListener('playing', () => {
    if (player) status.textContent = '正在播放';
  });
  stopPlayers.push(stop);
  container.append(card);
}

window.addEventListener('pagehide', () => {
  for (const stop of stopPlayers) stop();
});
