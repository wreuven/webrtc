// app/layout.js
import './globals.css';

export const metadata = {
  title: 'WebRTC Sender/Receiver',
  description: 'A WebRTC setup example with Next.js',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
