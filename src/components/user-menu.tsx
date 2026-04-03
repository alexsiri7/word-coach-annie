"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Moon, Sun, Monitor, User, MessageSquarePlus, Plug, Settings } from "lucide-react";
import { FeedbackDialog } from "@/components/feedback-dialog";

export function UserMenu() {
    const router = useRouter();
    const { authenticated, user, loading, logout } = useAuth();
    const { setTheme, theme } = useTheme();
    const [feedbackOpen, setFeedbackOpen] = useState(false);

    if (loading || !authenticated) return null;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                        {user?.picture ? (
                            <img
                                src={user.picture}
                                alt={user.name || "User"}
                                className="h-8 w-8 rounded-full"
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <User className="h-4 w-4" />
                        )}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    {user && (
                        <div className="px-2 py-1.5 text-sm">
                            <div className="font-medium">{user.name || "User"}</div>
                            <div className="text-muted-foreground text-xs truncate">{user.email}</div>
                        </div>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push("/settings")} className="cursor-pointer">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/setup")} className="cursor-pointer">
                        <Plug className="h-4 w-4 mr-2" />
                        Connect AI
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFeedbackOpen(true)} className="cursor-pointer">
                        <MessageSquarePlus className="h-4 w-4 mr-2" />
                        Send Feedback
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Theme</div>
                    <DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer">
                        <Sun className="h-4 w-4 mr-2" />
                        Light
                        {theme === "light" && <span className="ml-auto text-accent">&#10003;</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer">
                        <Moon className="h-4 w-4 mr-2" />
                        Dark
                        {theme === "dark" && <span className="ml-auto text-accent">&#10003;</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer">
                        <Monitor className="h-4 w-4 mr-2" />
                        System
                        {theme === "system" && <span className="ml-auto text-accent">&#10003;</span>}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-destructive cursor-pointer">
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign out
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <FeedbackDialog
                open={feedbackOpen}
                onOpenChange={setFeedbackOpen}
                userEmail={user?.email}
            />
        </>
    );
}
