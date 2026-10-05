import { notFound } from 'next/navigation'
import { GittoskillHome } from '@/components/gittoskill-home'
import { isValidGitHubProfileLogin } from '@/lib/parse-github-profile'
import type { Metadata } from 'next'

type PageProps = {
  params: Promise<{ owner: string }>
}

export default async function ProfilePage({ params }: PageProps) {
  const { owner: ownerRaw } = await params
  const owner = ownerRaw

  if (!isValidGitHubProfileLogin(owner)) {
    notFound()
  }

  return <GittoskillHome initialProfileInput={`@${owner}`} />
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { owner } = await params
  return {
    title: isValidGitHubProfileLogin(owner) ? `@${owner} coding style guide` : 'Profile',
    robots: { index: false, follow: true },
  }
}
