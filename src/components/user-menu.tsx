"use client";

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
import { LogOut, Moon, Sun, Monitor, User } from "lucide-react";

export function UserMenu() {
    const { authenticated, user, loading, logout } = useAuth();
    const { setTheme, theme } = useTheme();

    if (loading || !authenticated) return null;

    return (
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
    );
}
