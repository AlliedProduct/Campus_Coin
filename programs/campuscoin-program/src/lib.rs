use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("BMcUDqQmXSQMYyo67kyih8hDrNhRrT4Fb4XXYrJzYMdm");

#[program]
pub mod campuscoin_program {
    use super::*;

    /// oone time setup: stores the admin (college) and the CampusCoin mint
    pub fn init_campus(ctx: Context<InitCampus>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.admin = ctx.accounts.admin.key();
        state.mint = ctx.accounts.mint.key();
        Ok(())
    }

    /// admin registers a merchant (cafeteria) so students can pay them
    pub fn register_merchant(ctx: Context<RegisterMerchant>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.state.admin,
            ctx.accounts.admin.key(),
            CampusError::Unauthorized
        );

        let merchant = &mut ctx.accounts.merchant;
        merchant.merchant = ctx.accounts.merchant_key.key();
        merchant.allowed = true;
        Ok(())
    }

    /// student pays an approved merchant in CampusCoin.
    /// amount is in the mints smallest units (so 395 = 3.95 if decimals = 2).
    pub fn pay_merchant(ctx: Context<P2MPay>, amount: u64) -> Result<()> {
        // ensure merchant is registered and allowed.
        require!(
            ctx.accounts.merchant.allowed,
            CampusError::MerchantNotAllowed
        );

        let cpi_accounts = Transfer {
            from: ctx.accounts.payer_ata.to_account_info(),
            to: ctx.accounts.merchant_ata.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    /// admin mints CampusCoin rewards to a students token account.
    ///
    /// the admin must be the mint authority on the CampusCoin mint.
    pub fn earn_reward(ctx: Context<EarnReward>, amount: u64) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.state.admin,
            ctx.accounts.admin.key(),
            CampusError::Unauthorized
        );

        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.user_ata.to_account_info(),
            authority: ctx.accounts.admin.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

        token::mint_to(cpi_ctx, amount)?;
        Ok(())
    }
}

// accounts / PDAs

#[account]
pub struct State {
    pub admin: Pubkey,
    pub mint: Pubkey,
}

#[account]
pub struct Merchant {
    pub merchant: Pubkey,
    pub allowed: bool,
}

#[derive(Accounts)]
pub struct InitCampus<'info> {
    /// global state PDA.
    #[account(
        init,
        seeds = [b"state", mint.key().as_ref()],
        bump,
        payer = admin,
        space = 8 + 32 + 32,
    )]
    pub state: Account<'info, State>,

    /// admin (college treasury/admin) signer.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CampusCoin mint.
    pub mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterMerchant<'info> {
    /// global state PDA.
    #[account(
        mut,
        seeds = [b"state", mint.key().as_ref()],
        bump,
    )]
    pub state: Account<'info, State>,

    /// new merchant PDA.
    #[account(
        init,
        seeds = [b"merchant", merchant_key.key().as_ref()],
        bump,
        payer = admin,
        space = 8 + 32 + 1,
    )]
    pub merchant: Account<'info, Merchant>,

    /// CHECK: Pubkey of the merchant.
    pub merchant_key: UncheckedAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct P2MPay<'info> {
    /// student paying.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// students token account holding CampusCoin.
    #[account(mut)]
    pub payer_ata: Account<'info, TokenAccount>,

    /// merchants token account receiving CampusCoin.
    #[account(mut)]
    pub merchant_ata: Account<'info, TokenAccount>,

    /// CampusCoin mint.
    pub mint: Account<'info, Mint>,

    /// global state PDA.
    #[account(
        seeds = [b"state", mint.key().as_ref()],
        bump,
    )]
    pub state: Account<'info, State>,

    /// merchant PDA (derived from merchant owner pubkey).
    #[account(
        seeds = [b"merchant", merchant_ata.owner.as_ref()],
        bump,
    )]
    pub merchant: Account<'info, Merchant>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct EarnReward<'info> {
    /// students token account to receive reward.
    #[account(mut)]
    pub user_ata: Account<'info, TokenAccount>,

    /// CampusCoin mint.
    #[account(mut)]
    pub mint: Account<'info, Mint>,

    /// global state PDA.
    #[account(
        seeds = [b"state", mint.key().as_ref()],
        bump,
    )]
    pub state: Account<'info, State>,

    /// admin signer (has to be mint authortity).
    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// errors

#[error_code]
pub enum CampusError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Merchant not allowed")]
    MerchantNotAllowed,
}
