// Re-mounted on every navigation, so each page fades in once.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="anim-page">{children}</div>;
}
