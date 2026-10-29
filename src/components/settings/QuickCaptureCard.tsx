import { Link } from "@/lib/router-compat";
import { Zap, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function QuickCaptureCard() {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-primary" />Siri, Google and quick capture</CardTitle>
        <CardDescription>"Hey Siri, Tell V", a screenshot sent with a double-tap on the back of your phone, one-tap voice notes, and connections for Zapier and scripts.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild><Link to="/setup/shortcuts">Set up quick capture <ArrowRight className="w-4 h-4 ml-2" /></Link></Button>
      </CardContent>
    </Card>
  );
}
