
'use client';

import type { BoardGame } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CollectionConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  gamesToAdd: BoardGame[];
  gamesToRemove: BoardGame[];
  isSyncing: boolean;
}

export function CollectionConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  gamesToAdd,
  gamesToRemove,
  isSyncing,
}: CollectionConfirmationDialogProps) {
  if (!isOpen) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Database Sync</AlertDialogTitle>
          <AlertDialogDescription>
            Please review the changes that will be made to your game collection in the database.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="my-4 space-y-4 max-h-[50vh] overflow-y-auto">
          {gamesToAdd.length > 0 && (
            <div>
              <h4 className="font-semibold text-green-600 mb-1">Games to Add/Update ({gamesToAdd.length}):</h4>
              <ScrollArea className="h-32 w-full rounded-md border p-2">
                <ul className="list-disc list-inside text-sm">
                  {gamesToAdd.map(game => <li key={game.id}>{game.name}</li>)}
                </ul>
              </ScrollArea>
            </div>
          )}
          {gamesToRemove.length > 0 && (
            <div>
              <h4 className="font-semibold text-red-600 mb-1">Games to Remove ({gamesToRemove.length}):</h4>
               <ScrollArea className="h-32 w-full rounded-md border p-2">
                <ul className="list-disc list-inside text-sm">
                  {gamesToRemove.map(game => <li key={game.id}>{game.name}</li>)}
                </ul>
              </ScrollArea>
            </div>
          )}
          {gamesToAdd.length === 0 && gamesToRemove.length === 0 && (
            <p className="text-sm text-muted-foreground">No changes to sync.</p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isSyncing}>Cancel</AlertDialogCancel>
          <Button onClick={onConfirm} disabled={isSyncing || (gamesToAdd.length === 0 && gamesToRemove.length === 0)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {isSyncing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming...</>
            ) : (
              'Confirm Sync'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
