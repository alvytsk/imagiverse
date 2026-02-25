import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { type RegisterInput, RegisterSchema } from 'imagiverse-shared';
import { Camera } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError } from '@/lib/api-client';

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
  });

  const onSubmit = async (data: RegisterInput) => {
    setIsSubmitting(true);
    try {
      await registerUser(data);
      toast.success('Account created! Welcome to Imagiverse.');
      navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.details?.length) {
          for (const detail of err.details) {
            toast.error(`${detail.field}: ${detail.message}`);
          }
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error('Registration failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl shadow-xl md:grid-cols-2">
        {/* Left gradient panel — hidden on mobile */}
        <div className="hidden md:flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary to-primary/60 p-12 text-white">
          <Camera className="h-16 w-16" />
          <h2 className="text-3xl font-extrabold">Imagiverse</h2>
          <p className="text-center text-primary-foreground/80">
            Share your world, one photo at a time.
          </p>
        </div>

        {/* Mobile branding — visible only on mobile */}
        <div className="flex flex-col items-center gap-2 pt-8 md:hidden">
          <Camera className="h-10 w-10 text-primary" />
          <h2 className="text-xl font-extrabold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Imagiverse
          </h2>
        </div>

        {/* Right form */}
        <Card className="border-0 shadow-none rounded-none md:rounded-r-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">
              Create an account
            </CardTitle>
            <CardDescription className="text-center">
              Join Imagiverse and share your photos
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="John Doe"
                  autoComplete="name"
                  {...register('displayName')}
                />
                {errors.displayName && (
                  <p className="text-sm text-destructive">
                    {errors.displayName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="johndoe"
                  autoComplete="username"
                  {...register('username')}
                />
                {errors.username && (
                  <p className="text-sm text-destructive">
                    {errors.username.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
                isLoading={isSubmitting}
              >
                Create account
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                Already have an account?{' '}
                <Link to="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
