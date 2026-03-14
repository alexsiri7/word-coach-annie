"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, User, MapPin, BookOpen, Globe, StickyNote } from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

interface RelatedElementsPanelProps {
    elements: Record<string, { id: string; name: string; role?: string; description?: string; notes?: string }[]>;
    collapsed: boolean;
    onToggle: () => void;
}

const TYPE_ICONS: Record<string, typeof User> = {
    CHARACTER: User,
    LOCATION: MapPin,
    PLOTLINE: BookOpen,
    WORLD_ELEMENT: Globe,
    NOTE: StickyNote,
};

const TYPE_LABELS: Record<string, string> = {
    CHARACTER: "Characters",
    LOCATION: "Locations",
    PLOTLINE: "Plotlines",
    WORLD_ELEMENT: "World Elements",
    NOTE: "Notes",
};

export function RelatedElementsPanel({ elements, collapsed, onToggle }: RelatedElementsPanelProps) {
    if (collapsed) {
        return (
            <div className="hidden md:flex w-12 border-l bg-background flex-col items-center py-4 gap-4 h-full shrink-0">
                <Button variant="ghost" size="icon" onClick={onToggle} title="Expand Related">
                    <ChevronLeft className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    const hasElements = Object.values(elements || {}).some(arr => arr && arr.length > 0);

    return (
        <>
            <div className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm animate-in fade-in" onClick={onToggle} />
            <div className={cn(
                "flex flex-col h-full bg-background border-l shrink-0",
                "fixed inset-y-0 right-0 z-50 w-80 shadow-2xl animate-slide-in-right",
                "md:relative md:shadow-none md:z-auto"
            )}>
                <div className="p-4 border-b flex items-center justify-between">
                    <Button variant="ghost" size="icon" onClick={onToggle} className="h-6 w-6">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Related</h2>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {!hasElements ? (
                        <div className="text-center py-10 text-muted-foreground text-sm">
                            No related elements linked to this scene yet.
                        </div>
                    ) : (
                        <Accordion type="multiple" defaultValue={["CHARACTER", "LOCATION", "PLOTLINE"]} className="w-full space-y-4">
                            {Object.entries(elements).map(([type, items]) => {
                                if (!items || items.length === 0) return null;
                                const Icon = TYPE_ICONS[type] || StickyNote;

                                return (
                                    <AccordionItem key={type} value={type} className="border-none">
                                        <AccordionTrigger className="hover:no-underline py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                                            <span className="flex items-center gap-2">
                                                <Icon className="h-4 w-4" /> {TYPE_LABELS[type] || type}
                                                <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1">{items.length}</Badge>
                                            </span>
                                        </AccordionTrigger>
                                        <AccordionContent className="pt-2 pb-4 space-y-3">
                                            {items.map((item) => (
                                                <div key={item.id} className="p-3 rounded-md bg-card border shadow-sm">
                                                    <div className="font-medium text-sm mb-1">{item.name}</div>
                                                    {item.role && <div className="text-xs text-muted-foreground italic mb-2">{item.role}</div>}
                                                    {item.description && (
                                                        <div className="text-xs text-muted-foreground mb-2">{item.description}</div>
                                                    )}
                                                    {item.notes && (
                                                        <div className="text-xs bg-muted/50 p-2 rounded mt-2 border-l-2 border-primary/20">
                                                            {item.notes}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    )}
                </div>
            </div>
        </>
    );
}
