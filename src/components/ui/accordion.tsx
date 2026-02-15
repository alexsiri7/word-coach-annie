"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const AccordionContext = React.createContext<{
    value?: string;
    onValueChange?: (value: string) => void;
}>({});

const Accordion = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & {
        type: "single" | "multiple";
        collapsible?: boolean;
        defaultValue?: string;
    }
>(({ className, type, collapsible, defaultValue, children, ...props }, ref) => {
    const [value, setValue] = React.useState<string>(defaultValue || "");

    const handleValueChange = (newValue: string) => {
        setValue(newValue === value && collapsible ? "" : newValue);
    };

    return (
        <AccordionContext.Provider value={{ value, onValueChange: handleValueChange }}>
            <div ref={ref} className={cn("", className)} {...props}>
                {children}
            </div>
        </AccordionContext.Provider>
    );
});
Accordion.displayName = "Accordion";

const AccordionItem = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, ...props }, ref) => (
    <div ref={ref} className={cn("border-b", className)} {...props} data-value={value} />
));
AccordionItem.displayName = "AccordionItem";

const AccordionTrigger = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
    const { value, onValueChange } = React.useContext(AccordionContext);
    // Find parent item value
    // In a real implementation this would be cleaner with context per item, but this is a quick fix
    // We need to know which item we are in.
    // Let's assume the parent AccordionItem passes context or we just use simple state here.
    // Actually, to make this work properly without Radix logic is tricky in one go.
    // Let's simplify: passing `onClick` from parent item isn't easy without cloning children.

    // Alternative: create a context for Item too.
    return (
        <AccordionItemContext.Consumer>
            {({ value: itemValue }) => {
                const isOpen = value === itemValue;
                return (
                    <div className="flex">
                        <button
                            ref={ref}
                            onClick={() => onValueChange?.(itemValue)}
                            className={cn(
                                "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
                                className
                            )}
                            data-state={isOpen ? "open" : "closed"}
                            {...props}
                        >
                            {children}
                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                        </button>
                    </div>
                )
            }}
        </AccordionItemContext.Consumer>
    );
});
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
    const { value } = React.useContext(AccordionContext);
    return (
        <AccordionItemContext.Consumer>
            {({ value: itemValue }) => {
                const isOpen = value === itemValue;
                if (!isOpen) return null;
                return (
                    <div
                        ref={ref}
                        className={cn(
                            "overflow-hidden text-sm transition-all animate-accordion-down",
                            className
                        )}
                        {...props}
                    >
                        <div className={cn("pb-4 pt-0", className)}>{children}</div>
                    </div>
                );
            }}
        </AccordionItemContext.Consumer>
    )
});
AccordionContent.displayName = "AccordionContent";

// Helper context for Item
const AccordionItemContext = React.createContext<{ value: string }>({ value: "" });

// Wrap AccordionItem to provide context
const AccordionItemWrapper = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, children, ...props }, ref) => (
    <AccordionItemContext.Provider value={{ value }}>
        <div ref={ref} className={cn("border-b", className)} {...props}>
            {children}
        </div>
    </AccordionItemContext.Provider>
));
AccordionItemWrapper.displayName = "AccordionItem";


export { Accordion, AccordionItemWrapper as AccordionItem, AccordionTrigger, AccordionContent };
