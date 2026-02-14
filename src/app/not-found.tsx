
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-surface">
            <h2 className="text-2xl font-bold mb-4 text-text-primary">Page Not Found</h2>
            <p className="text-text-muted mb-8">Could not find requested resource</p>
            <Link href="/">
                <Button>Return Home</Button>
            </Link>
        </div>
    )
}
