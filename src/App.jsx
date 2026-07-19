import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  ExternalLink,
  GitFork,
  Image,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  Moon,
  Search,
  Star,
  Sun,
  X,
} from 'lucide-react';
import { api } from './api';
import packageMetadata from '../package.json';

const appVersion = packageMetadata.version;
const projectWebsiteUrl = 'https://meteor-history.com';

function GitHubIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.22c-3.22.7-3.9-1.36-3.9-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.38-5.28 5.67.42.36.79 1.06.79 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" /></svg>;
}

function Metric({ label, value, delta }) {
  return <div className="metric">
    <span>{label}</span>
    <strong>{value.toLocaleString('en-US')}</strong>
    {delta != null && <small>+{delta.toLocaleString('en-US')}</small>}
  </div>;
}

function CopyField({ icon, label, value, name, copied, onCopy }) {
  return <div className="copy-field">
    <div className="copy-label">{icon}<span>{label}</span></div>
    <div className="copy-control">
      <code title={value}>{value}</code>
      <button type="button" onClick={() => onCopy(value, name)}>
        {copied === name ? <Check size={15} /> : <Copy size={15} />}
        {copied === name ? 'Copied' : 'Copy'}
      </button>
    </div>
  </div>;
}

function defaultChartOptions(theme = 'light') {
  const dark = theme === 'dark';
  return {
    theme,
    style: 'xkcd',
    color: dark ? '#ff6b6b' : '#dd4528',
    background: dark ? '#0d1117' : '#ffffff',
    textColor: dark ? '#ffffff' : '#000000',
    width: 900,
    height: 600,
    lineWidth: 3,
    showTitle: true,
    showLegend: true,
    showDots: false,
  };
}

const profileThemes = {
  auto: { titleColor: '#2f80ed', textColor: '#434d58', iconColor: '#4c71f2', ringColor: '#2f80ed', borderColor: '#e4e2e2', background: '#fffefe' },
  default: { titleColor: '#2f80ed', textColor: '#434d58', iconColor: '#4c71f2', ringColor: '#2f80ed', borderColor: '#e4e2e2', background: '#fffefe' },
  dark: { titleColor: '#ffffff', textColor: '#9f9f9f', iconColor: '#79ff97', ringColor: '#ffffff', borderColor: '#30363d', background: '#151515' },
  radical: { titleColor: '#fe428e', textColor: '#a9fef7', iconColor: '#f8d847', ringColor: '#fe428e', borderColor: '#fe428e', background: '#141321' },
  merko: { titleColor: '#abd200', textColor: '#68b587', iconColor: '#b7d364', ringColor: '#abd200', borderColor: '#26372a', background: '#0a0f0b' },
  gruvbox: { titleColor: '#fabd2f', textColor: '#8ec07c', iconColor: '#fe8019', ringColor: '#fabd2f', borderColor: '#504945', background: '#282828' },
  tokyonight: { titleColor: '#70a5fd', textColor: '#38bdae', iconColor: '#bf91f3', ringColor: '#70a5fd', borderColor: '#343b58', background: '#1a1b27' },
  onedark: { titleColor: '#e4bf7a', textColor: '#df6d74', iconColor: '#8eb573', ringColor: '#e4bf7a', borderColor: '#4b5263', background: '#282c34' },
  cobalt: { titleColor: '#e683d9', textColor: '#75eeb2', iconColor: '#0480ef', ringColor: '#e683d9', borderColor: '#285f8f', background: '#193549' },
  synthwave: { titleColor: '#e2e9ec', textColor: '#e5289e', iconColor: '#ef8539', ringColor: '#e2e9ec', borderColor: '#6b3f75', background: '#2b213a' },
  highcontrast: { titleColor: '#e7f216', textColor: '#ffffff', iconColor: '#00ffff', ringColor: '#e7f216', borderColor: '#ffffff', background: '#000000' },
  dracula: { titleColor: '#ff6e96', textColor: '#f8f8f2', iconColor: '#79dafa', ringColor: '#ff6e96', borderColor: '#6272a4', background: '#282a36' },
};

function defaultProfileOptions(theme = 'default') {
  return {
    theme,
    ...profileThemes[theme],
    hideBorder: false,
    hideTitle: false,
    hideRank: false,
    showIcons: false,
    textBold: true,
    transparentBackground: false,
    borderRadius: 4.5,
    width: 450,
    lineHeight: 25,
    numberFormat: 'short',
    rankIcon: 'default',
  };
}

export function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [chartOptions, setChartOptions] = useState(() => defaultChartOptions(theme));
  const [health, setHealth] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [githubProfile, setGitHubProfile] = useState(null);
  const [profileCard, setProfileCard] = useState(null);
  const [history, setHistory] = useState(null);
  const [filter, setFilter] = useState('');
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pendingRepository, setPendingRepository] = useState(null);
  const [lastSeenSync, setLastSeenSync] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileOptions, setProfileOptions] = useState(() => defaultProfileOptions(theme === 'dark' ? 'dark' : 'default'));
  const [profileFollowsWebTheme, setProfileFollowsWebTheme] = useState(true);

  const imageUrl = useMemo(() => {
    if (!history) return '';
    const url = new URL(history.embedUrl, location.origin);
    const query = {
      theme: chartOptions.theme,
      style: chartOptions.style,
      color: chartOptions.color.replace('#', ''),
      background: chartOptions.background.replace('#', ''),
      textColor: chartOptions.textColor.replace('#', ''),
      width: String(chartOptions.width),
      height: String(chartOptions.height),
      lineWidth: String(chartOptions.lineWidth),
      showTitle: String(chartOptions.showTitle),
      showLegend: String(chartOptions.showLegend),
      showDots: String(chartOptions.showDots),
      v: '3',
    };
    Object.entries(query).forEach(([name, value]) => url.searchParams.set(name, value));
    return url.toString();
  }, [chartOptions, history]);
  const markdown = history ? `[![${history.fullName} Star History](${imageUrl})](${projectWebsiteUrl})` : '';
  const profileImageUrl = useMemo(() => {
    if (!profileCard) return '';
    const url = new URL(profileCard.embedUrl, location.origin);
    const query = {
      theme: profileOptions.theme,
      title_color: profileOptions.titleColor.replace('#', ''),
      text_color: profileOptions.textColor.replace('#', ''),
      icon_color: profileOptions.iconColor.replace('#', ''),
      ring_color: profileOptions.ringColor.replace('#', ''),
      border_color: profileOptions.borderColor.replace('#', ''),
      bg_color: profileOptions.transparentBackground ? '00000000' : profileOptions.background.replace('#', ''),
      hide_border: String(profileOptions.hideBorder),
      hide_title: String(profileOptions.hideTitle),
      hide_rank: String(profileOptions.hideRank),
      show_icons: String(profileOptions.showIcons),
      text_bold: String(profileOptions.textBold),
      border_radius: String(profileOptions.borderRadius),
      card_width: String(profileOptions.width),
      line_height: String(profileOptions.lineHeight),
      number_format: profileOptions.numberFormat,
      rank_icon: profileOptions.rankIcon,
      v: '3',
    };
    Object.entries(query).forEach(([name, value]) => url.searchParams.set(name, value));
    return url.toString();
  }, [profileCard, profileOptions]);
  const profileMarkdown = profileCard ? `[![${profileCard.owner}'s GitHub Stats](${profileImageUrl})](${projectWebsiteUrl})` : '';
  const visibleRepositories = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return repositories;
    return repositories.filter((repo) => repo.fullName.toLowerCase().includes(keyword) || repo.description?.toLowerCase().includes(keyword));
  }, [filter, repositories]);
  const totalStars = useMemo(() => repositories.reduce((total, repo) => total + repo.stars, 0), [repositories]);
  const profile = githubProfile || (repositories[0] ? { login: repositories[0].owner, avatarUrl: repositories[0].avatarUrl, bio: null } : null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!profileFollowsWebTheme) return;
    setProfileOptions(defaultProfileOptions(theme === 'dark' ? 'dark' : 'default'));
  }, [theme, profileFollowsWebTheme]);

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!health?.tokenConfigured) return undefined;
    const timer = setInterval(() => pollJsonCache(), 5000);
    return () => clearInterval(timer);
  }, [health?.tokenConfigured, history?.fullName, pendingRepository?.fullName, lastSeenSync, modalOpen]);

  useEffect(() => {
    if (!modalOpen && !profileModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (profileModalOpen) closeProfileModal();
      else closeModal();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [modalOpen, profileModalOpen]);

  async function bootstrap() {
    setLoadingRepos(true);
    setError('');
    try {
      const status = await api('/api/health');
      setHealth(status);
      if (!status.tokenConfigured) return;
      await readRepositories(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingRepos(false);
    }
  }

  async function readRepositories(openRequested = false) {
    setLoadingRepos(true);
    setError('');
    try {
      const result = await api('/api/repositories');
      setRepositories(result.repositories);
      setGitHubProfile(result.profile || null);
      setProfileCard(result.profileCard || null);
      if (openRequested && result.repositories.length) {
        const requestedProfileCard = new URLSearchParams(location.search).get('profile') === 'card';
        if (requestedProfileCard && result.profileCard) {
          setProfileModalOpen(true);
          return;
        }
        const requested = new URLSearchParams(location.search).get('repo')?.toLowerCase();
        const selected = requested && result.repositories.find((repo) => repo.fullName.toLowerCase() === requested);
        if (selected) {
          setModalOpen(true);
          await loadHistory(selected);
        }
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingRepos(false);
    }
  }

  async function pollJsonCache() {
    try {
      const [status, repositoryResult] = await Promise.all([api('/api/health'), api('/api/repositories')]);
      setHealth(status);
      setRepositories(repositoryResult.repositories);
      setGitHubProfile(repositoryResult.profile || null);
      setProfileCard(repositoryResult.profileCard || null);
      const completedAt = status.sync?.lastCompletedAt;
      if (completedAt && completedAt !== lastSeenSync) {
        setLastSeenSync(completedAt);
        if (modalOpen && pendingRepository) await loadHistory(pendingRepository);
        else if (modalOpen && history) await loadHistory(history, { quiet: true });
      }
    } catch {
      // The visible JSON cache remains usable while a status poll fails.
    }
  }

  async function loadHistory(repository, { quiet = false } = {}) {
    if (!quiet) setLoadingHistory(true);
    if (!quiet) setPendingRepository(repository);
    setError('');
    try {
      const value = await api(`/api/history/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo || repository.name)}`);
      setHistory(value);
      setPendingRepository(null);
      const url = new URL(location.href);
      url.searchParams.set('repo', value.fullName);
      window.history.replaceState({}, '', url);
    } catch (requestError) {
      if (requestError.code === 'HISTORY_PENDING') {
        setHistory(null);
        setPendingRepository(repository);
      } else {
        setError(requestError.message);
      }
    } finally {
      if (!quiet) setLoadingHistory(false);
    }
  }

  async function copyText(value, name) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(name);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setError('Copy failed. Select the text and copy it manually.');
    }
  }

  function updateChartOption(name, value) {
    setChartOptions((current) => ({ ...current, [name]: value }));
  }

  function changeEmbedTheme(nextTheme) {
    setChartOptions((current) => ({ ...current, ...defaultChartOptions(nextTheme), style: current.style, width: current.width, height: current.height, lineWidth: current.lineWidth, showTitle: current.showTitle, showLegend: current.showLegend, showDots: current.showDots }));
  }

  function openRepository(repository) {
    setHistory(null);
    setPendingRepository(repository);
    setModalOpen(true);
    setChartOptions(defaultChartOptions(theme));
    loadHistory(repository);
  }

  function closeModal() {
    setModalOpen(false);
    setHistory(null);
    setPendingRepository(null);
    setError('');
    const url = new URL(location.href);
    url.searchParams.delete('repo');
    window.history.replaceState({}, '', url);
  }

  function updateProfileOption(name, value) {
    setProfileFollowsWebTheme(false);
    setProfileOptions((current) => ({ ...current, [name]: value }));
  }

  function changeProfileTheme(nextTheme) {
    setProfileFollowsWebTheme(false);
    setProfileOptions((current) => ({
      ...current,
      ...profileThemes[nextTheme],
      theme: nextTheme,
      transparentBackground: false,
    }));
  }

  function resetProfileOptions() {
    setProfileFollowsWebTheme(false);
    setProfileOptions(defaultProfileOptions(profileOptions.theme));
  }

  function closeProfileModal() {
    setProfileModalOpen(false);
    setError('');
    const url = new URL(location.href);
    url.searchParams.delete('profile');
    window.history.replaceState({}, '', url);
  }

  function openProfileModal() {
    setProfileModalOpen(true);
    const url = new URL(location.href);
    url.searchParams.set('profile', 'card');
    window.history.replaceState({}, '', url);
  }

  return <div className="dashboard-app">
    <header className="dashboard-header">
      <a className="brand" href="/" aria-label="Meteor History home">
        <span className="brand-mark"><img src="/project-icon.svg" alt="" /></span>
        <span>Meteor History</span>
      </a>
      <div className="header-actions">
        <a className="github-profile-link" href="https://github.com/MengMengCode" target="_blank" rel="noreferrer" aria-label={`Open MengMengCode on GitHub, Meteor History version ${appVersion}`}>
          <GitHubIcon />
          <span className="github-project-name">Meteor History</span>
          <code>v{appVersion}</code>
        </a>
        <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>

    {!health?.tokenConfigured && health ? <main className="setup-page">
      <div className="setup-card">
        <div className="setup-icon"><GitHubIcon size={24} /></div>
        <h1>Connect Your GitHub Repositories</h1>
        <p>Add a fine-grained token to display repositories you own or collaborate on, along with their star history.</p>
        <div className="setup-code"><span>1</span><code>Copy-Item .env.example .env</code></div>
        <div className="setup-code"><span>2</span><code>GITHUB_TOKEN=github_pat_xxx</code></div>
        <div className="setup-code"><span>3</span><code>npm run dev</code></div>
        <div className="setup-note"><LockKeyhole size={15} /> The token stays on the server and is never sent to the browser.</div>
      </div>
    </main> : <main className="showcase-page">
      <section className="showcase-intro">
        <div className="profile-copy">
          {profile ? <img src={profile.avatarUrl} alt="" /> : <div className="profile-placeholder"><GitHubIcon size={26} /></div>}
          <div><span>GITHUB PROFILE</span><h1>{profile ? `${profile.login}'s repositories` : 'My repositories'}</h1>{profile?.bio && <p>{profile.bio}</p>}</div>
        </div>
        <div className="profile-stats"><div><strong>{repositories.length}</strong><span>Repositories</span></div><div><strong>{totalStars.toLocaleString('en-US')}</strong><span>Total Stars</span></div></div>
      </section>

      {profileCard && <section className="profile-card-showcase" aria-labelledby="profile-card-title">
        <div className="profile-card-heading">
          <div><span>GITHUB STATS</span><h2 id="profile-card-title">Profile Card</h2><p>GitHub activity stats generated from the scheduled JSON cache.</p></div>
          <button className="secondary-button" type="button" onClick={openProfileModal}><Copy size={14} />Customize &amp; Copy</button>
        </div>
        <button className="profile-card-preview" type="button" onClick={openProfileModal} aria-label="Customize GitHub profile card">
          <img src={profileImageUrl} alt={`${profileCard.owner}'s GitHub stats card`} />
        </button>
      </section>}

      <section className="repository-showcase" aria-labelledby="repository-title">
        <div className="gallery-heading"><div><span>MY WORK</span><h2 id="repository-title">Repositories</h2></div><label className="gallery-search"><Search size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search repositories" aria-label="Search repositories" /></label></div>
        <div className="repo-gallery">
          {loadingRepos && !repositories.length ? Array.from({ length: 6 }, (_, index) => <div className="gallery-skeleton" key={index}><i /><span /><small /></div>) : visibleRepositories.length ? visibleRepositories.map((repo) => {
            const active = modalOpen && (history?.fullName.toLowerCase() === repo.fullName.toLowerCase() || pendingRepository?.fullName === repo.fullName);
            return <button className={`repo-card ${active ? 'active' : ''}`} key={repo.fullName} onClick={() => openRepository(repo)}>
              <div className="repo-card-top"><span className="repo-icon"><GitHubIcon size={18} /></span><span className="repo-card-counters"><span className="repo-card-stars" title="Stars"><Star size={13} fill="currentColor" />{repo.stars.toLocaleString('en-US')}</span><span className="repo-card-forks" title="Forks"><GitFork size={13} />{Number(repo.forks || 0).toLocaleString('en-US')}</span></span></div>
              <h3>{repo.name}</h3>
              <p>{repo.description || 'GitHub repository'}</p>
            </button>;
          }) : <div className="gallery-empty">{filter ? 'No repositories match your search' : 'No repositories to display yet'}</div>}
        </div>
      </section>
      {error && !modalOpen && <div className="dashboard-error page-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    </main>}

    {modalOpen && <div className="repo-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
      <section className="repo-modal" role="dialog" aria-modal="true" aria-labelledby="repo-modal-title">
        <div className="repo-modal-header">
          {history ? <>
            <div className="selected-repo">
              <img src={history.avatarUrl} alt="" />
              <div>
                <div className="repo-label">{history.private && <span><LockKeyhole size={11} /> Private</span>} Repository</div>
                <h1 id="repo-modal-title">{history.fullName}</h1>
                {history.description && <p>{history.description}</p>}
              </div>
            </div>
          </> : <div><div className="repo-label">Repository</div><h1 id="repo-modal-title">{pendingRepository?.fullName || 'Star History'}</h1></div>}
          <div className="repo-modal-actions">
            {history && <a className="secondary-button" href={history.htmlUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />GitHub</a>}
            <button className="modal-close" type="button" onClick={closeModal} aria-label="Close repository details" autoFocus><X size={18} /></button>
          </div>
        </div>

        <div className="repo-modal-body">
          {error && <div className="dashboard-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
          {loadingHistory && !history ? <div className="modal-loading"><LoaderCircle className="spin" size={24} /><span>Loading star history…</span></div> : history ? <>
          <div className="modal-chart">
            <div className="metrics">
              <Metric label="Total Stars" value={history.summary.current} />
              <Metric label="Last 30 Days" value={history.summary.last30Days} delta={history.summary.last30Days} />
              <Metric label="Last Year" value={history.summary.last365Days} delta={history.summary.last365Days} />
              <div className="updated">Updated {history.updatedAtLabel}</div>
            </div>
            <div className="image-preview modal-image-preview">
              <div className="image-preview-header"><span>Chart Preview</span><a href={imageUrl} target="_blank" rel="noreferrer">Open Image <ExternalLink size={12} /></a></div>
              <img src={imageUrl} alt={`${history.fullName} star history chart`} />
            </div>
          </div>

          <div className="share-card modal-share-card">
            <div className="share-heading">
              <div><h2>Share This Repository's Star Chart</h2><p>Copy the image URL or paste the Markdown directly into the project README.</p></div>
              <div className="theme-switch" aria-label="Embedded image theme">
                <button className={chartOptions.theme === 'auto' ? 'active' : ''} onClick={() => changeEmbedTheme('auto')}><Monitor size={13} />Auto</button>
                <button className={chartOptions.theme === 'light' ? 'active' : ''} onClick={() => changeEmbedTheme('light')}><Sun size={13} />Light</button>
                <button className={chartOptions.theme === 'dark' ? 'active' : ''} onClick={() => changeEmbedTheme('dark')}><Moon size={13} />Dark</button>
              </div>
            </div>
            <div className="chart-options">
              <div className="chart-options-heading"><div><strong>Chart Options</strong><span>Shields-style URL parameters</span></div><button type="button" onClick={() => setChartOptions(defaultChartOptions(chartOptions.theme))}>Reset</button></div>
              <div className="chart-options-grid">
                <label className="option-control"><span>Style</span><select value={chartOptions.style} onChange={(event) => updateChartOption('style', event.target.value)}><option value="xkcd">Hand-drawn</option><option value="clean">Clean</option><option value="minimal">Minimal</option><option value="bold">Bold</option><option value="neon">Neon</option></select></label>
                <label className="option-control"><span>Line color</span><div className="color-control"><input type="color" value={chartOptions.color} onChange={(event) => updateChartOption('color', event.target.value)} /><code>{chartOptions.color}</code></div></label>
                <label className="option-control"><span>Background</span><div className="color-control"><input type="color" value={chartOptions.background} onChange={(event) => updateChartOption('background', event.target.value)} /><code>{chartOptions.background}</code></div></label>
                <label className="option-control"><span>Text color</span><div className="color-control"><input type="color" value={chartOptions.textColor} onChange={(event) => updateChartOption('textColor', event.target.value)} /><code>{chartOptions.textColor}</code></div></label>
                <label className="option-control"><span>Width</span><input type="number" min="600" max="1400" step="50" value={chartOptions.width} onChange={(event) => updateChartOption('width', event.target.value)} /></label>
                <label className="option-control"><span>Height</span><input type="number" min="400" max="900" step="50" value={chartOptions.height} onChange={(event) => updateChartOption('height', event.target.value)} /></label>
                <label className="option-control"><span>Line width</span><input type="number" min="1" max="8" step="0.5" value={chartOptions.lineWidth} onChange={(event) => updateChartOption('lineWidth', event.target.value)} /></label>
              </div>
              <div className="chart-option-toggles">
                <label><input type="checkbox" checked={chartOptions.showTitle} onChange={(event) => updateChartOption('showTitle', event.target.checked)} />Title</label>
                <label><input type="checkbox" checked={chartOptions.showLegend} onChange={(event) => updateChartOption('showLegend', event.target.checked)} />Legend</label>
                <label><input type="checkbox" checked={chartOptions.showDots} onChange={(event) => updateChartOption('showDots', event.target.checked)} />Point markers</label>
              </div>
            </div>
            <div className="copy-fields">
              <CopyField icon={<Image size={15} />} label="Image URL" value={imageUrl} name="image" copied={copied} onCopy={copyText} />
              <CopyField icon={<Code2 size={15} />} label="Markdown" value={markdown} name="markdown" copied={copied} onCopy={copyText} />
            </div>
            {history.private && <div className="private-warning"><LockKeyhole size={14} />This is a private repository. Review the image endpoint access policy before deploying publicly.</div>}
          </div>
          </> : pendingRepository && <div className="modal-loading"><LoaderCircle className="spin" size={24} /><strong>{pendingRepository.fullName}</strong><span>Preparing star history. It will appear automatically…</span></div>}
        </div>
      </section>
    </div>}

    {profileModalOpen && profileCard && <div className="repo-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProfileModal(); }}>
      <section className="repo-modal profile-card-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
        <div className="repo-modal-header">
          <div><div className="repo-label">GitHub Profile Card</div><h1 id="profile-modal-title">{profileCard.owner}'s GitHub Stats</h1></div>
          <button className="modal-close" type="button" onClick={closeProfileModal} aria-label="Close profile card editor" autoFocus><X size={18} /></button>
        </div>
        <div className="repo-modal-body profile-card-modal-body">
          <div className="profile-modal-preview"><img src={profileImageUrl} alt={`${profileCard.owner}'s customized GitHub stats card`} /></div>
          <div className="share-card modal-share-card profile-options-card">
            <div className="chart-options">
              <div className="chart-options-heading"><div><strong>Profile Card Options</strong><span>GitHub Readme Stats-style parameters</span></div><button type="button" onClick={resetProfileOptions}>Reset</button></div>
              <div className="chart-options-grid">
                <label className="option-control"><span>Theme</span><select value={profileOptions.theme} onChange={(event) => changeProfileTheme(event.target.value)}><option value="auto">Auto</option><option value="default">Default</option><option value="dark">Dark</option><option value="radical">Radical</option><option value="merko">Merko</option><option value="gruvbox">Gruvbox</option><option value="tokyonight">Tokyo Night</option><option value="onedark">One Dark</option><option value="cobalt">Cobalt</option><option value="synthwave">Synthwave</option><option value="highcontrast">High Contrast</option><option value="dracula">Dracula</option></select></label>
                <label className="option-control"><span>Title color</span><div className="color-control"><input type="color" value={profileOptions.titleColor} onChange={(event) => updateProfileOption('titleColor', event.target.value)} /><code>{profileOptions.titleColor}</code></div></label>
                <label className="option-control"><span>Text color</span><div className="color-control"><input type="color" value={profileOptions.textColor} onChange={(event) => updateProfileOption('textColor', event.target.value)} /><code>{profileOptions.textColor}</code></div></label>
                <label className="option-control"><span>Icon color</span><div className="color-control"><input type="color" value={profileOptions.iconColor} onChange={(event) => updateProfileOption('iconColor', event.target.value)} /><code>{profileOptions.iconColor}</code></div></label>
                <label className="option-control"><span>Ring color</span><div className="color-control"><input type="color" value={profileOptions.ringColor} onChange={(event) => updateProfileOption('ringColor', event.target.value)} /><code>{profileOptions.ringColor}</code></div></label>
                <label className="option-control"><span>Border color</span><div className="color-control"><input type="color" value={profileOptions.borderColor} onChange={(event) => updateProfileOption('borderColor', event.target.value)} /><code>{profileOptions.borderColor}</code></div></label>
                <label className="option-control"><span>Background</span><div className="color-control"><input type="color" value={profileOptions.background} disabled={profileOptions.transparentBackground} onChange={(event) => updateProfileOption('background', event.target.value)} /><code>{profileOptions.transparentBackground ? 'transparent' : profileOptions.background}</code></div></label>
                <label className="option-control"><span>Card width</span><input type="number" min="420" max="800" step="5" value={profileOptions.width} onChange={(event) => updateProfileOption('width', event.target.value)} /></label>
                <label className="option-control"><span>Border radius</span><input type="number" min="0" max="24" step="0.5" value={profileOptions.borderRadius} onChange={(event) => updateProfileOption('borderRadius', event.target.value)} /></label>
                <label className="option-control"><span>Line height</span><input type="number" min="20" max="35" value={profileOptions.lineHeight} onChange={(event) => updateProfileOption('lineHeight', event.target.value)} /></label>
                <label className="option-control"><span>Number format</span><select value={profileOptions.numberFormat} onChange={(event) => updateProfileOption('numberFormat', event.target.value)}><option value="short">Short (1.2k)</option><option value="long">Long (1,234)</option></select></label>
                <label className="option-control"><span>Rank icon</span><select value={profileOptions.rankIcon} onChange={(event) => updateProfileOption('rankIcon', event.target.value)}><option value="default">Rank level</option><option value="percentile">Percentile</option><option value="github">GitHub</option></select></label>
              </div>
              <div className="chart-option-toggles">
                <label><input type="checkbox" checked={profileOptions.showIcons} onChange={(event) => updateProfileOption('showIcons', event.target.checked)} />Icons</label>
                <label><input type="checkbox" checked={profileOptions.textBold} onChange={(event) => updateProfileOption('textBold', event.target.checked)} />Bold text</label>
                <label><input type="checkbox" checked={profileOptions.hideTitle} onChange={(event) => updateProfileOption('hideTitle', event.target.checked)} />Hide title</label>
                <label><input type="checkbox" checked={profileOptions.hideRank} onChange={(event) => updateProfileOption('hideRank', event.target.checked)} />Hide rank</label>
                <label><input type="checkbox" checked={profileOptions.hideBorder} onChange={(event) => updateProfileOption('hideBorder', event.target.checked)} />Hide border</label>
                <label><input type="checkbox" checked={profileOptions.transparentBackground} onChange={(event) => updateProfileOption('transparentBackground', event.target.checked)} />Transparent background</label>
              </div>
            </div>
            <div className="copy-fields">
              <CopyField icon={<Image size={15} />} label="Profile Card URL" value={profileImageUrl} name="profile-image" copied={copied} onCopy={copyText} />
              <CopyField icon={<Code2 size={15} />} label="Markdown" value={profileMarkdown} name="profile-markdown" copied={copied} onCopy={copyText} />
            </div>
          </div>
        </div>
      </section>
    </div>}
  </div>;
}
