import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { InternalHttpClient } from './internal-http.client';
import { InternalApiGuard } from './internal-api.guard';
@Module({imports:[HttpModule],providers:[InternalHttpClient,InternalApiGuard],exports:[InternalHttpClient,InternalApiGuard]}) export class InternalHttpModule {}
