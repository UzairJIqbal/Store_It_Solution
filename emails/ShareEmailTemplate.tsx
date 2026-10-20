import { Html, Head, Preview, Heading, Section, Text, Button } from '@react-email/components';

interface ShareEmailProps {
  sharerName: string;
  fileName: string;
  role: 'viewer' | 'editor';
  message?: string;
  url: string;
}

export default function ShareEmail({ sharerName, fileName, role, message, url }: ShareEmailProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <title>{`${sharerName} shared a file with you`}</title>
      </Head>
      <Preview>{`${sharerName} shared "${fileName}" with you on StoreIt`}</Preview>
      <Section style={{ fontFamily: 'Verdana, sans-serif', padding: '24px' }}>
        <Heading as="h2" style={{ color: '#333F4E' }}>
          {sharerName} shared &quot;{fileName}&quot; with you
        </Heading>
        <Text>You can {role === 'editor' ? 'view, rename and share' : 'view and download'} this file.</Text>
        {message ? <Text style={{ borderLeft: '3px solid #FA7275', paddingLeft: '12px', whiteSpace: 'pre-wrap' }}>{message}</Text> : null}
        <Button
          href={url}
          style={{ background: '#FA7275', color: '#ffffff', padding: '12px 20px', borderRadius: '24px', textDecoration: 'none' }}
        >
          Open in StoreIt
        </Button>
        <Text style={{ color: '#A3B2C7', fontSize: '12px' }}>
          You got this email because someone shared a file with this address on StoreIt.
        </Text>
      </Section>
    </Html>
  );
}
