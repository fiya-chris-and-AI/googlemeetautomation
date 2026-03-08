'use client';

import { useEffect, useCallback } from 'react';

interface ScreenshotLightboxProps {
    /** URL of the image to display. */
    src: string;
    /** Alt text for the image. */
    alt: string;
    /** Called when the lightbox should close. */
    onClose: () => void;
}

/**
 * Full-screen lightbox for viewing a screenshot.
 *
 * Dark backdrop, centered image, closes on:
 * - Clicking the backdrop
 * - Pressing Escape
 * - Clicking the × button
 */
export function ScreenshotLightbox({ src, alt, onClose }: ScreenshotLightboxProps) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        // Prevent body scroll while lightbox is open
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [handleKeyDown]);

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            {/* Image — stop propagation to prevent closing when clicking the image */}
            <img
                src={src}
                alt={alt}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    );
}
