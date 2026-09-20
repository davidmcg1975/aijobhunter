export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <h1
          style={{
            fontSize: "1.35rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            textAlign: "center",
            marginBottom: "1.2rem",
          }}
        >
          AI Contract Hunter
        </h1>
        {children}
      </div>
    </main>
  );
}
