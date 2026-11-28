import { Module } from '@nestjs/common';
import { ScalabilityController } from './scalability.controller';
import { ScalabilityService } from './scalability.service';

@Module({ controllers: [ScalabilityController], providers: [ScalabilityService] })
export class ScalabilityModule {}
