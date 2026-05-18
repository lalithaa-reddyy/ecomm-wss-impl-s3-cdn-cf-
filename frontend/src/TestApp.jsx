export default function TestApp() {
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID || "Not configured";
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID || "Not configured";

  return (
    <div style={{ padding: '20px', fontSize: '20px', color: '#000' }}>
      <h1>✅ React is working!</h1>
      <p>If you see this, React rendered successfully.</p>
      <p>Cognito User Pool: {userPoolId}</p>
      <p>Client ID: {clientId}</p>
    </div>
  )
}
