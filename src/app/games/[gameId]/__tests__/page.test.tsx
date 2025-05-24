import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import GameDetailPage from '../page';
import { useSearchParams } from 'next/navigation';
import * as actions from '@/lib/actions';
import type { BoardGame } from '@/lib/types';

// Mock the necessary modules and hooks
jest.mock('@/contexts/auth-context');
jest.mock('@/hooks/use-toast');
jest.mock('next/navigation');
jest.mock('@/lib/actions');

// Mock data
const mockGame: BoardGame = {
  id: 'game123',
  name: 'Test Game',
  bggId: '12345',
  coverArtUrl: 'https://example.com/image.jpg',
  overallAverageRating: 4.5,
  voteCount: 10,
  reviews: [],
  favoritedByUserIds: [],
  playlistedByUserIds: [],
  morchiaByUserIds: [],
  favoriteCount: 0,
  morchiaCount: 0,
  isPinned: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockUser = {
  uid: 'user123',
  email: 'test@example.com',
};

const mockToast = jest.fn();

describe('GameDetailPage', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Setup default mocks
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: false,
      isAdmin: false,
    });

    (useToast as jest.Mock).mockReturnValue({
      toast: mockToast,
    });

    (useSearchParams as jest.Mock).mockReturnValue({
      get: jest.fn().mockReturnValue(null),
    });

    (actions.getGameDetails as jest.Mock).mockResolvedValue(mockGame);
  });

  describe('Loading States', () => {
    it('should show loading state when fetching game data', async () => {
      render(<GameDetailPage params={Promise.resolve({ gameId: 'game123' })} />);
      
      expect(screen.getByText('Caricamento dettagli gioco...')).toBeInTheDocument();
    });

    it('should show error state when game is not found', async () => {
      (actions.getGameDetails as jest.Mock).mockResolvedValue(null);
      
      render(<GameDetailPage params={Promise.resolve({ gameId: 'nonexistent' })} />);
      
      await waitFor(() => {
        expect(screen.getByText('Errore: Gioco Non Trovato')).toBeInTheDocument();
      });
    });
  });

  describe('Game Details Display', () => {
    it('should display basic game information', async () => {
      render(<GameDetailPage params={Promise.resolve({ gameId: 'game123' })} />);

      await waitFor(() => {
        expect(screen.getByText(mockGame.name)).toBeInTheDocument();
        expect(screen.getByText(`${mockGame.voteCount} voti`)).toBeInTheDocument();
      });
    });

    it('should display rating information when available', async () => {
      const gameWithRating = {
        ...mockGame,
        overallAverageRating: 4.5,
      };
      (actions.getGameDetails as jest.Mock).mockResolvedValue(gameWithRating);

      render(<GameDetailPage params={Promise.resolve({ gameId: 'game123' })} />);

      await waitFor(() => {
        expect(screen.getByText('4.5')).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: mockUser,
        loading: false,
        isAdmin: false,
      });
    });

    it('should allow users to favorite a game', async () => {
      render(<GameDetailPage params={Promise.resolve({ gameId: 'game123' })} />);

      await waitFor(() => {
        const favoriteButton = screen.getByTitle(/Aggiungi ai Preferiti/i);
        fireEvent.click(favoriteButton);
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Aggiunto ai Preferiti'),
        })
      );
    });

    it('should allow users to add game to playlist', async () => {
      render(<GameDetailPage params={Promise.resolve({ gameId: 'game123' })} />);

      await waitFor(() => {
        const playlistButton = screen.getByTitle(/Aggiungi alla Playlist/i);
        fireEvent.click(playlistButton);
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Aggiunto alla Playlist'),
        })
      );
    });
  });

  describe('Admin Features', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        user: mockUser,
        loading: false,
        isAdmin: true,
      });
    });

    it('should show pin/unpin option for admins', async () => {
      render(<GameDetailPage params={Promise.resolve({ gameId: 'game123' })} />);

      await waitFor(() => {
        const pinButton = screen.getByTitle(/Aggiungi alla vetrina/i);
        expect(pinButton).toBeInTheDocument();
      });
    });

    it('should allow admins to refresh BGG data', async () => {
      render(<GameDetailPage params={Promise.resolve({ gameId: 'game123' })} />);

      await waitFor(() => {
        const refreshButton = screen.getByText(/Aggiorna Dati BGG/i);
        fireEvent.click(refreshButton);
      });

      expect(actions.getAllGamesAction).toHaveBeenCalled();
    });
  });

  describe('Reviews', () => {
    const gameWithReviews = {
      ...mockGame,
      reviews: [
        {
          id: 'review1',
          userId: 'user123',
          rating: {
            fun: 5,
            replayability: 4,
            componentsThemeLore: 5,
            excitedToReplay: 5,
            mentallyStimulating: 5,
            decisionDepth: 5,
            luck: 5,
            lengthDowntime: 5,
            graphicDesign: 5,
            effortToLearn: 5,
            setupTeardown: 5,
          },
          content: 'Great game!',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    beforeEach(() => {
      (actions.getGameDetails as jest.Mock).mockResolvedValue(gameWithReviews);
    });

    it('should display user review when available', async () => {
      render(<GameDetailPage params={Promise.resolve({ gameId: 'game123' })} />);

      await waitFor(() => {
        expect(screen.getByText('La Tua Valutazione')).toBeInTheDocument();
        expect(screen.getByText('Great game!')).toBeInTheDocument();
      });
    });

    it('should show review prompt for non-reviewed games', async () => {
      (actions.getGameDetails as jest.Mock).mockResolvedValue(mockGame);

      render(<GameDetailPage params={Promise.resolve({ gameId: 'game123' })} />);

      await waitFor(() => {
        expect(screen.getByText('Condividi la Tua Opinione')).toBeInTheDocument();
      });
    });
  });
}); 