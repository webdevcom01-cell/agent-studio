"use client";

import { useSession } from "next-auth/react";
import { User, Mail, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfilePage(): React.ReactElement {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const user = session?.user;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your account information from the OAuth provider.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Account Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {user?.image && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={user.image}
                alt="Avatar"
                className="size-10 rounded-full border border-border"
              />
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <User className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground w-16 shrink-0">Name</span>
              <span className="font-medium">{user?.name ?? "—"}</span>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <Mail className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground w-16 shrink-0">Email</span>
              <span className="font-medium">{user?.email ?? "—"}</span>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <Calendar className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground w-16 shrink-0">ID</span>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                {user?.id ?? "—"}
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Profile details are managed by your OAuth provider (GitHub or Google).
        To update your name or avatar, change them in your provider account.
      </p>
    </div>
  );
}
