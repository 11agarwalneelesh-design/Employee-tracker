"use client";

import React, { useState } from 'react';
import Image from 'next/image'; // 👈 Image component import kiya

export default function AdminLogin({ setAuthStatus }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            // Backend API par request bhejein
            const response = await fetch('http://localhost:4000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Login successful hone par role aur email browser mein save karein
                localStorage.setItem('userRole', data.role);
                localStorage.setItem('userEmail', data.email);
                
                // App ke state ko update karein taaki dashboard khul jaye
                setAuthStatus(true);
            } else {
                setError(data.error || 'Invalid credentials');
            }
        } catch (err) {
            setError('Server connection failed. Is the backend running?');
        }
    };

    return (
        <div style={styles.container}>
            {/* 👈 Background image ko clear dikhane ke liye dark overlay */}
            <div style={styles.overlay}></div> 

            <div style={styles.card}>
                
                {/* 👈 Middle Logo Section */}
                <div style={styles.logoContainer}>
                    <Image 
                        src="/logo.png" 
                        alt="Ethara.AI Logo" 
                        width={120} 
                        height={40} 
                        style={{ objectFit: 'contain' }}
                        priority
                    />
                </div>

                <h2>Admin Ingest Node</h2>
                <p style={{ color: '#9ca3af', fontSize: '14px' }}>Please log in to view telemetry data.</p>
                
                <form onSubmit={handleLogin} style={styles.form}>
                    <input 
                        type="text" 
                        placeholder="Email or Username" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={styles.input}
                        required
                    />
                    <input 
                        type="password" 
                        placeholder="Password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={styles.input}
                        required
                    />
                    {error && <p style={styles.error}>{error}</p>}
                    
                    <button type="submit" style={styles.button}>Secure Login</button>
                </form>
            </div>
        </div>
    );
}

// 👈 Styles mein background image aur logo ka design add kiya gaya hai
const styles = {
    container: { 
        position: 'relative',
        display: 'flex', 
        height: '100vh', 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: '#0b0f19',
        backgroundImage: "url('/bg-image.jpg')", // 👈 Background Image ka path
        backgroundSize: 'cover',
        backgroundPosition: 'center',
    },
    overlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(11, 15, 25, 0.75)', // 👈 Dark transparent layer
        zIndex: 0
    },
    card: { 
        position: 'relative',
        zIndex: 1,
        padding: '40px', 
        backgroundColor: 'rgba(17, 24, 39, 0.95)', 
        borderRadius: '12px', 
        color: 'white', 
        width: '380px', 
        textAlign: 'center', 
        border: '1px solid #1f2937',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' // 👈 Box ke piche shadow
    },
    logoContainer: {
        backgroundColor: 'white',
        padding: '12px',
        borderRadius: '8px',
        display: 'inline-block',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    },
    form: { display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' },
    input: { padding: '12px', borderRadius: '6px', border: '1px solid #374151', backgroundColor: '#1f2937', color: 'white', outline: 'none' },
    button: { padding: '12px', backgroundColor: '#0ea5e9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' },
    error: { color: '#ef4444', fontSize: '14px', margin: '0' }
};