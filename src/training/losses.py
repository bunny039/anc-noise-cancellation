import torch
import torch.nn as nn
import torch.nn.functional as F

class MultiResSpecLoss(nn.Module):
    """
    Multi-resolution spectral loss for speech enhancement.
    Computes magnitude and complex STFT loss across multiple FFT sizes.
    Used for training DeepFilterNet.
    """
    def __init__(self, fft_sizes=[256, 512, 1024, 2048], gamma=0.3, factor_magnitude=500.0, factor_complex=500.0):
        super().__init__()
        self.fft_sizes = fft_sizes
        self.gamma = gamma
        self.factor_magnitude = factor_magnitude
        self.factor_complex = factor_complex
        
        # We need hop size and window for each FFT size, usually hop = fft_size // 4
        self.hop_sizes = [f // 4 for f in fft_sizes]
        
    def _stft(self, x, n_fft, hop_length):
        # x shape: [batch, time]
        window = torch.hann_window(n_fft, device=x.device)
        return torch.stft(x, n_fft=n_fft, hop_length=hop_length, window=window, return_complex=True)
        
    def forward(self, est, target):
        """
        est: Estimated speech, shape [batch, time]
        target: Target clean speech, shape [batch, time]
        """
        loss_mag = 0.0
        loss_cplx = 0.0
        
        for n_fft, hop in zip(self.fft_sizes, self.hop_sizes):
            stft_est = self._stft(est, n_fft, hop)
            stft_tgt = self._stft(target, n_fft, hop)
            
            mag_est = torch.abs(stft_est)
            mag_tgt = torch.abs(stft_tgt)
            
            # Compress magnitudes
            comp_est = mag_est ** self.gamma
            comp_tgt = mag_tgt ** self.gamma
            
            # Magnitude loss (L1)
            loss_mag += F.l1_loss(comp_est, comp_tgt)
            
            # Complex loss (compress real and imaginary parts while preserving phase)
            phase_est = torch.exp(1j * torch.angle(stft_est))
            phase_tgt = torch.exp(1j * torch.angle(stft_tgt))
            
            cplx_comp_est = comp_est * phase_est
            cplx_comp_tgt = comp_tgt * phase_tgt
            
            loss_cplx += F.l1_loss(cplx_comp_est.real, cplx_comp_tgt.real) + \
                         F.l1_loss(cplx_comp_est.imag, cplx_comp_tgt.imag)
                         
        total_loss = (self.factor_magnitude * loss_mag) + (self.factor_complex * loss_cplx)
        return total_loss / len(self.fft_sizes)
