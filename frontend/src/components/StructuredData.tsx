export default function StructuredData() {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Zionite FM',
    alternateName: 'The Voice of Redemption',
    url: 'https://zionite.vercel.app',
    logo: 'https://zionite.vercel.app/icon-512.svg',
    description: 'The official digital radio ministry of The Redemption Project.',
    sameAs: [
      'https://facebook.com/zionitefm',
      'https://instagram.com/zionitefm',
      'https://youtube.com/zionitefm',
      'https://twitter.com/zionitefm',
    ],
  }
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Zionite FM',
    url: 'https://zionite.vercel.app',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://zionite.vercel.app/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }} />
    </>
  )
}
