import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { createMint } from '@solana/spl-token';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = new PublicKey('BMcUDqQmXSQMYyo67kyih8hDrNhRrT4Fb4XXYrJzYMdm');
const DECIMALS = 2;

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const admin = provider.wallet as anchor.Wallet;

  // load idl from dir
  const idlPath = path.resolve(__dirname, '../target/idl/campuscoin_program.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  const program = new Program(idl, provider);

  console.log('Admin wallet:', admin.publicKey.toBase58());
  console.log('Program ID: ', PROGRAM_ID.toBase58());
  console.log('Network:    ', provider.connection.rpcEndpoint);
  console.log('');

  // create campuscoin mint
  console.log('Creating CampusCoin mint...');
  const mint = await createMint(
    provider.connection,
    admin.payer, // fee payer
    admin.publicKey, // mint authority (admin can mint rewards)
    null, // no freeze authority
    DECIMALS // 2 decimals = 1.00 CAMP
  );
  console.log('✓ Mint created:', mint.toBase58());
  console.log('');

  // derive state pda
  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('state'), mint.toBuffer()],
    PROGRAM_ID
  );
  console.log('State PDA:', statePda.toBase58());

  // init_campus call
  console.log('Initializing campus state...');
  const tx = await program.methods
    .initCampus()
    .accounts({
      state: statePda,
      admin: admin.publicKey,
      mint,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log('✓ init_campus tx:', tx);
  console.log('');

  // save mint addy for frontend
  const envPath = path.resolve(__dirname, '../../app/.env.local');
  const envLine = `NEXT_PUBLIC_CAMPUSCOIN_MINT=${mint.toBase58()}\nNEXT_PUBLIC_SOLANA_NETWORK=${
    provider.connection.rpcEndpoint
  }\n`;
  fs.writeFileSync(envPath, envLine);
  console.log(`✓ Wrote ${envPath}`);
  console.log('');
  console.log('─────────────────────────────────────────────────────────');
  console.log('SETUP COMPLETE');
  console.log('─────────────────────────────────────────────────────────');
  console.log('Mint address:', mint.toBase58());
  console.log('Add this to app/.env.local (already done):');
  console.log(`  NEXT_PUBLIC_CAMPUSCOIN_MINT=${mint.toBase58()}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. cd app && npm install');
  console.log('  2. npm run dev');
  console.log('  3. Connect Phantom (set to localhost RPC) and start using it!');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
