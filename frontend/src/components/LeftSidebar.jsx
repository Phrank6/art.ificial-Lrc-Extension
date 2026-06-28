export default function LeftSidebar({ activeNav, setActiveNav, projects, currentFilename }) {
  return (
    <aside className="w-[264px] flex-shrink-0 flex flex-col h-screen bg-[#050608] border-r border-[rgba(46,48,51,0.25)] overflow-hidden">

      {/* Logo */}
      <div
        style={{
          width: '264px',
          height: '176px',
          aspectRatio: '3/2',
          background: 'url(/lumina-logo.png) transparent 50% / cover no-repeat',
          flexShrink: 0,
        }}
        role="img"
        aria-label="Lumina AI"
      />

      {/* Navigation */}
      <nav className="px-4 space-y-0.5">
        <NavItem id="home"    label="Home"    active={activeNav === 'home'}    onClick={() => setActiveNav('home')}>
          <HomeIcon />
        </NavItem>
        <NavItem id="editor"  label="Editor"  active={activeNav === 'editor'}  onClick={() => setActiveNav('editor')}>
          <EditorIcon />
        </NavItem>
        <NavItem id="style"   label="Style"   active={activeNav === 'style'}   onClick={() => setActiveNav('style')}>
          <StyleIcon />
        </NavItem>
        <NavItem id="project" label="Project" active={activeNav === 'project'} onClick={() => setActiveNav('project')}>
          <ProjectIcon />
        </NavItem>
        <NavItem id="learn"   label="Learn"   active={activeNav === 'learn'}   onClick={() => setActiveNav('learn')} badge="New">
          <LearnIcon />
        </NavItem>
      </nav>

      {/* Projects section */}
      <div className="mt-5 px-4 flex-1 min-h-0 flex flex-col">
        <p className="font-poppins text-[#8D93A1] text-[13px] font-medium tracking-[0.12em] uppercase mb-2 px-1">
          Projects
        </p>
        <div className="space-y-0.5 flex-1 overflow-y-auto scrollbar-none">
          {projects.slice(0, 4).map((p, i) => (
            <ProjectItem
              key={i}
              filename={p.filename}
              active={currentFilename === p.filename}
              isFirst={i === 0}
            />
          ))}
          {/* Fill remaining slots with placeholders */}
          {projects.length === 0 && (
            <>
              {[0,1,2,3].map(i => <ProjectItem key={i} filename="Photo Name.jpg" />)}
            </>
          )}
        </div>
        <button className="mt-3 px-1 text-[#8B5CF6] text-[13px] font-poppins text-left hover:text-[#a78bfa] transition-colors">
          View all projects &gt;
        </button>
      </div>

      {/* Footer links */}
      <div className="px-5 py-5 space-y-3.5">
        <FooterLink icon={<SettingsIcon />} label="Settings" />
        <FooterLink icon={<HelpIcon />}     label="Help & Feedback" />
      </div>
    </aside>
  )
}

function NavItem({ label, active, onClick, children, badge }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-3 rounded-[10px] text-[14px] font-poppins transition-colors ${
        active
          ? 'border border-[#8B5CF6] bg-transparent text-white'
          : 'border border-transparent text-[#8D93A1] hover:text-white hover:bg-[rgba(255,255,255,0.04)]'
      }`}
    >
      <span className={`w-[18px] h-[18px] flex items-center justify-center flex-shrink-0 ${active ? 'text-white' : 'text-[#8D93A1]'}`}>
        {children}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="bg-[#151531] text-[#8B5CF6] text-[11px] font-poppins font-medium px-2 py-0.5 rounded-[5px]">
          {badge}
        </span>
      )}
    </button>
  )
}

function ProjectItem({ filename, active, isFirst }) {
  const short = filename.length > 16 ? filename.slice(0, 14) + '…' : filename
  return (
    <div className={`flex items-center gap-2.5 px-2 py-2 rounded-[5px] cursor-pointer transition-colors ${
      isFirst ? 'bg-[#121822]' : 'bg-transparent hover:bg-[rgba(255,255,255,0.03)]'
    }`}>
      {/* Thumbnail placeholder */}
      <div className="w-[21px] h-[25px] bg-[#d9d9d9]/20 rounded-[4px] flex-shrink-0" />
      <span className="font-poppins text-white text-[11px] font-medium flex-1 truncate">{short}</span>
      <button className="text-[#8D93A1] hover:text-white transition-colors opacity-60 hover:opacity-100">
        <svg width="3" height="14" viewBox="0 0 3 14" fill="currentColor">
          <circle cx="1.5" cy="2"  r="1.5" />
          <circle cx="1.5" cy="7"  r="1.5" />
          <circle cx="1.5" cy="12" r="1.5" />
        </svg>
      </button>
    </div>
  )
}

function FooterLink({ icon, label }) {
  return (
    <button className="flex items-center gap-3 text-[#8D93A1] hover:text-white transition-colors w-full">
      <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">{icon}</span>
      <span className="font-poppins text-[13px]">{label}</span>
    </button>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M1 7.5L9 1l8 6.5V17a1 1 0 01-1 1H11v-5H7v5H2a1 1 0 01-1-1V7.5z"/>
    </svg>
  )
}

function EditorIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 2l3 3-9.5 9.5L3 15l.5-3.5L13 2z"/>
    </svg>
  )
}

function StyleIcon() {
  return (
    <svg viewBox="0 0 20 19" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12c0 2.76 2.24 5 5 5s5-2.24 5-5V5H3v7z"/>
      <path strokeLinecap="round" d="M13 5h4"/>
    </svg>
  )
}

function ProjectIcon() {
  return (
    <svg viewBox="0 0 20 18" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 5a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V5z"/>
    </svg>
  )
}

function LearnIcon() {
  return (
    <svg viewBox="0 0 16 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 1h8l4 4v14H3V1z"/>
      <path strokeLinecap="round" d="M6 7h4M6 10h4M6 13h2"/>
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4.5 h-4.5">
      <circle cx="10" cy="10" r="3"/>
      <path strokeLinecap="round" d="M10 1v2M10 17v2M1 10h2M17 10h2M3.22 3.22l1.42 1.42M15.36 15.36l1.42 1.42M3.22 16.78l1.42-1.42M15.36 4.64l1.42-1.42"/>
    </svg>
  )
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-4.5 h-4.5">
      <circle cx="10" cy="10" r="9"/>
      <path strokeLinecap="round" d="M9.09 7a3 3 0 015.83 1c0 2-3 3-3 3"/>
      <circle cx="10" cy="14" r=".5" fill="currentColor"/>
    </svg>
  )
}
