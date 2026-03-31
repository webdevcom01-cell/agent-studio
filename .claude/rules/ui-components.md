# UI Component Rules — agent-studio

Rules for all files in `src/components/` and `src/app/`.

## Styling — Tailwind CSS v4 Only
```tsx
// ✅ Only Tailwind utility classes
<div className="flex items-center gap-2 rounded-lg bg-zinc-900 p-4">

// ❌ No inline styles
<div style={{ display: 'flex', gap: 8 }}>

// ❌ No CSS modules
import styles from './Component.module.css';
```

## Dark Mode
The app runs in dark mode by default (`<html className="dark">`).
Always design for dark mode first. Use `dark:` variants for light mode overrides if needed.

## UI Primitives
Use Radix UI for interactive components (dialogs, dropdowns, tooltips, etc.):
```tsx
// ✅
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

// Available in src/components/ui/:
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
```

## Icons
Only lucide-react:
```tsx
import { Search, Settings, ChevronDown } from 'lucide-react';
// ❌ No heroicons, no react-icons, no custom SVG imports
```

## Component Variants
Use class-variance-authority (cva) for variants, not conditional string concatenation:
```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva('base-classes', {
  variants: {
    variant: { default: '...', destructive: '...' },
    size: { sm: '...', md: '...', lg: '...' },
  },
});
```

## Utility Function
Always use `cn()` for conditional class merging:
```tsx
import { cn } from '@/lib/utils';
<div className={cn('base-class', isActive && 'active-class', className)}>
```

## Client vs Server Components
- Default: Server Component (no directive needed)
- Add `'use client'` ONLY when using: useState, useEffect, useRef, event handlers, browser APIs
- Never import server-only modules (`logger`, `prisma`) in client components

## Toasts
Use Sonner (not react-hot-toast, not shadcn/toast):
```tsx
import { toast } from 'sonner';
toast.success('Agent created');
toast.error('Failed to save');
```

## Data Fetching in Client Components
Use SWR for client-side data fetching:
```tsx
import useSWR from 'swr';
const { data, error, isLoading, mutate } = useSWR(`/api/agents/${agentId}`, fetcher);
```
Never use useEffect + fetch directly for data fetching.
