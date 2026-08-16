import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 800, padding: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem', color: '#ff4b2b' }}>
          Privacy & Security Policy
        </h1>
        <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>Last updated: {new Date().toLocaleDateString()}</p>

        <div className="glass" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <section>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>1. Data Collection</h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
              We collect information you provide directly to us, such as when you create or modify your account, 
              manage your profile, or interact with the platform (e.g., adding movies to your wishlist or watched list).
              This includes your name, email address, username, and interaction history.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>2. How We Use Your Data</h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
              The data we collect is used to personalize your movie recommendations, provide core functionality 
              like tracking your watched history, and to secure your account. Your email is used strictly for 
              account verification and recovery processes via secure OTP.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>3. Data Security & Passwords</h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
              Security is a top priority. All passwords are mathematically hashed using the industry-standard bcrypt algorithm. 
              This means we never store or see your actual password. Our login processes employ rate limiting and session 
              management to protect against unauthorized access.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>4. Session Tracking</h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
              To ensure the security of your account, we track active login sessions. This includes recording 
              basic details such as the device type, operating system, and IP address of each login. You have 
              full control over these sessions and can revoke access to any recognized device at any time from 
              your Security settings.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>5. Account Deletion</h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
              You have the right to delete your account and all associated data at any time. Account deletion is 
              a secure process requiring email OTP verification to prevent unauthorized removal. Once completed, 
              all personal data, session records, and viewing history are permanently erased from our systems.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
