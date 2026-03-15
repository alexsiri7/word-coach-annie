"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import React from "react";
import { Search, FileText, Users, MapPin, GitBranch, Globe, StickyNote, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SceneResult {
    type: "scene";
    id: string;
    title: string;
    parentId: string | null;
    snippet: string;
}

interface ObjectResult {
    type: "story_object";
    id: string;
    name: string;
    objectType: string;
    snippet: string;
}

interface SearchResults {
    query: string;
    scenes: SceneResult[];
    storyObjects: ObjectResult[];
    totalResults: number;
}

interface SearchPanelProps {
    projectId: string;
    onSelectScene: (sceneId: string) => void;
    onSelectObject: (objectId: string, objectType: string) => void;
    onClose: () => void;
}

const OBJECT_TYPE_ICONS: Record<string, typeof Users> = {
    CHARACTER: Users,
    LOCATION: MapPin,
    PLOTLINE: GitBranch,
    WORLD_ELEMENT: Globe,
    NOTE: StickyNote,
};

const OBJECT_TYPE_LABELS: Record<string, string> = {
    CHARACTER: "Character",
    LOCATION: "Location",
    PLOTLINE: "Plotline",
    WORLD_ELEMENT: "World Element",
    NOTE: "Note",
};

function highlightSnippet(snippet: string, query: string): React.ReactNode {
    if (!query) return <>{snippet}</>;

    const parts = snippet.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase() ? (
                    <mark key={i} className="search-highlight">{part}</mark>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    );
}

export function SearchPanel({ projectId, onSelectScene, onSelectObject, onClose }: SearchPanelProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResults | null>(null);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-focus on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Keyboard shortcut to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const doSearch = useCallback(async (q: string) => {
        if (q.trim().length < 2) {
            setResults(null);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/search?q=${encodeURIComponent(q.trim())}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data);
            }
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    const handleInputChange = (value: string) => {
        setQuery(value);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(value), 300);
    };

    return (
        <div className="search-panel border-b border-border bg-surface-raised animate-slide-up" role="search" aria-label="Search project">
            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3">
                <Search className="h-4 w-4 text-text-muted flex-shrink-0" />
                <Input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder="Search scenes, characters, locations..."
                    className="h-8 border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
                />
                {loading && (
                    <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
                <button
                    onClick={onClose}
                    className="h-6 w-6 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors flex-shrink-0"
                    aria-label="Close search"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Results */}
            {results && (
                <div className="border-t border-border-subtle max-h-80 overflow-y-auto" aria-live="polite">
                    {results.totalResults === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-text-muted">
                            No results found for &ldquo;{results.query}&rdquo;
                        </div>
                    ) : (
                        <div className="py-1">
                            {/* Scene results */}
                            {results.scenes.length > 0 && (
                                <div>
                                    <div className="px-4 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                                        Scenes ({results.scenes.length})
                                    </div>
                                    {results.scenes.map((scene) => (
                                        <button
                                            key={scene.id}
                                            className="w-full text-left px-4 py-2.5 hover:bg-surface-overlay/50 transition-colors"
                                            onClick={() => {
                                                onSelectScene(scene.id);
                                                onClose();
                                            }}
                                        >
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <FileText className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                                                <span className="text-sm font-medium text-text-primary truncate">
                                                    {scene.title}
                                                </span>
                                            </div>
                                            <p className="text-xs text-text-muted pl-5.5 leading-relaxed line-clamp-2">
                                                {highlightSnippet(scene.snippet, results.query)}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Story object results */}
                            {results.storyObjects.length > 0 && (
                                <div>
                                    <div className="px-4 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider mt-1">
                                        Story Elements ({results.storyObjects.length})
                                    </div>
                                    {results.storyObjects.map((obj) => {
                                        const ObjIcon = OBJECT_TYPE_ICONS[obj.objectType] || FileText;
                                        return (
                                            <button
                                                key={obj.id}
                                                className="w-full text-left px-4 py-2.5 hover:bg-surface-overlay/50 transition-colors"
                                                onClick={() => {
                                                    onSelectObject(obj.id, obj.objectType);
                                                    onClose();
                                                }}
                                            >
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <ObjIcon className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                                                    <span className="text-sm font-medium text-text-primary truncate">
                                                        {obj.name}
                                                    </span>
                                                    <span className="tag-pill text-[10px] py-0">
                                                        {OBJECT_TYPE_LABELS[obj.objectType] || obj.objectType}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-text-muted pl-5.5 leading-relaxed line-clamp-2">
                                                    {highlightSnippet(obj.snippet, results.query)}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="px-4 py-2 text-[10px] text-text-muted text-center border-t border-border-subtle">
                                {results.totalResults} result{results.totalResults !== 1 ? "s" : ""} found
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* No query hint */}
            {!results && query.length === 0 && (
                <div className="border-t border-border-subtle px-4 py-4 text-xs text-text-muted text-center">
                    Type at least 2 characters to search
                </div>
            )}
        </div>
    );
}
