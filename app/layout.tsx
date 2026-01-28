export const metadata = {
  title: "CryptoCroc Scanner",
  description: "Bull & Bear scanner",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}