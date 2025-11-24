import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from '@solana/spl-token';
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { CampuscoinProgram } from '../target/types/campuscoin_program';

describe('campuscoin-program', () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.CampuscoinProgram as Program<CampuscoinProgram>;

  const admin = provider.wallet;

  let mint: PublicKey;
  let statePda: PublicKey;

  const student = Keypair.generate();
  const merchantOwner = Keypair.generate();

  let studentAta: PublicKey;
  let merchantAta: PublicKey;
  let merchantPda: PublicKey;

  it('Initializes campus state, creates mint, ATAs, and mints to student', async () => {
    // fund student and merchant with SOL for fees
    for (const kp of [student, merchantOwner]) {
      const sig = await provider.connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, 'confirmed');
    }

    // 1) create CampusCoin mint, admin is mint authority
    mint = await createMint(
      provider.connection,
      admin.payer, // fee payer
      admin.publicKey, // mint authority
      null, // no freeze authority
      2 // decimals
    );

    // 2) create ATAs
    const studentAtaAcc = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      mint,
      student.publicKey
    );
    studentAta = studentAtaAcc.address;

    const merchantAtaAcc = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      mint,
      merchantOwner.publicKey
    );
    merchantAta = merchantAtaAcc.address;

    // 3) mint 10_000 (100.00 CAMP) to student
    await mintTo(provider.connection, admin.payer, mint, studentAta, admin.payer, 10_000);

    // 4) derive state PDA
    [statePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('state'), mint.toBuffer()],
      program.programId
    );

    // 5) call init_campus -> initCampus() on JS
    await program.methods
      .initCampus()
      .accounts({
        state: statePda,
        admin: admin.publicKey,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const stateAccount = await program.account.state.fetch(statePda);
    console.log('State:', stateAccount);
  });

  it('Registers a merchant and processes a student payment', async () => {
    // 1) merchant PDA
    [merchantPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('merchant'), merchantOwner.publicKey.toBuffer()],
      program.programId
    );

    // 2) register_merchant -> registerMerchant()
    await program.methods
      .registerMerchant()
      .accounts({
        state: statePda,
        merchant: merchantPda,
        merchantKey: merchantOwner.publicKey,
        admin: admin.publicKey,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const merchantAccount = await program.account.merchant.fetch(merchantPda);
    console.log('Merchant:', merchantAccount);

    // 3) student pays merchant 1.23 CAMP (123 units)
    const amount = 123;

    await program.methods
      .payMerchant(new anchor.BN(amount))
      .accounts({
        payer: student.publicKey,
        payerAta: studentAta,
        merchantAta,
        mint,
        state: statePda,
        merchant: merchantPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([student])
      .rpc();

    // 4) check balances
    const studentTokenAcc = await getAccount(provider.connection, studentAta);
    const merchantTokenAcc = await getAccount(provider.connection, merchantAta);

    console.log('Student balance:', Number(studentTokenAcc.amount));
    console.log('Merchant balance:', Number(merchantTokenAcc.amount));

    if (Number(studentTokenAcc.amount) !== 10_000 - amount) {
      throw new Error('Student balance incorrect after payment');
    }
    if (Number(merchantTokenAcc.amount) !== amount) {
      throw new Error('Merchant balance incorrect after payment');
    }
  });

  it('Admin grants CampusCoin rewards to student', async () => {
    const rewardAmount = 500; // 5.00 CAMP

    // earnon local validator_reward -> earnReward()
    await program.methods
      .earnReward(new anchor.BN(rewardAmount))
      .accounts({
        userAta: studentAta,
        mint,
        state: statePda,
        admin: admin.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const studentTokenAcc = await getAccount(provider.connection, studentAta);
    console.log('Student balance after reward:', Number(studentTokenAcc.amount));

    if (Number(studentTokenAcc.amount) !== 10_000 - 123 + rewardAmount) {
      throw new Error('Student balance incorrect after reward');
    }
  });
});
