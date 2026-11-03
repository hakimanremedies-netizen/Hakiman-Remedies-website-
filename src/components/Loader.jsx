// Full-screen Hakiman logo loader. Styles are in index.html so the same loader
// also shows before the app has loaded.
export default function Loader() {
  return (
    <div className="hk-loader" role="status" aria-label="Loading">
      <img src="/assets/logo.png" alt="The Hakiman" />
    </div>
  )
}
