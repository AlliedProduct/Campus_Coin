use anchor_lang::prelude::*;

declare_id!("9VBP44gJxUmhVT9nj1CKYmAZZTR3cErJoHtosk8ooPGQ");

#[program]
pub mod campuscoin_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
